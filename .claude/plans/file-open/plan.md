# Plan: profile and baseline "open a file" performance (app overhead only)

Final home once approved: `.claude/plans/file-open/plan.md` (project repo). Copy this file there as step 0.

## Context
Startup perf was analysed and improved (`.claude/plans/startup/`, branch `startup-perf`). Opening a file is the next slowest user-visible flow. Scope here is **madden-franchise-editor only**: IPC, main-process wrappers, renderer work after the file is open. Time spent inside `madden-franchise` (parse, schema load) is measured as one opaque span and not analysed. The goal of this plan is to build the measurement and capture a baseline. Optimisation is a later plan driven by those numbers.

## What the open path does today (traced)
Trigger: `welcomeService.openFileFromPath` (welcomeService.js:268) -> 50ms `setTimeout` -> emits `open-file` -> handler `navigationService.js:604`.

1. `fs.exists` IPC, loader shown, hard-coded `setTimeout(50)` (welcomeService.js:273).
2. `recentFileService.addFile` (awaited concurrently with the open).
3. `franchiseAPI.getMetadataFromFilePath` -> `FranchiseFile.create(filePath)` -> `_buildMetadata` (FranchiseFileManager.js:1133). **This parses the whole file once, only to read `format`, then throws it away.**
4. Franchise-common files: `ftcModalService.promptForFtcOverrides()` (user wait, excluded from timing; the Madden/CFB career files here are not common files).
5. `franchiseAPI.openFile` -> `FranchiseFileManager.openFile` (:308) -> `new FranchiseFile(...)` with `autoParse: true`, waits for `ready`. **Second full parse of the same file.** Then `_applyPreferencesToFile` reads prefs, `_backupFile` writes `file.rawContents` to `backup.bak` (fire-and-forget but competes for IO/CPU), `_buildMetadata` maps every table (`tableCount` entries) and sends the list over IPC.
6. Renderer: `generateMainNavigationTabs()`, `file-loaded` IPC -> main sets title, enables menus, starts a chokidar watch (main.js:524, :1082); `is-currently-searching` IPC -> schema-search status round trip.
7. `defaultEditor` preference (`data/preferencesSchema.json:16`) routes the post-open step (navigationService.js:674):
   - `open-home` (default): `refreshCurrentPage` if a service is already open, else nothing; welcome shows opened-file links.
   - `open-table-editor`: `onTableEditorClicked` -> `loadPage("table-editor.html")` -> `TableEditorWrapper.start` -> `getMetadata` IPC (a second metadata build) -> `TableEditorView._initialLoad` -> `getTableList` IPC + Selectr construction over every table -> pins init.
   - `open-schedule`: `onScheduleEditorClicked` -> `schedule.html` -> `scheduleService.loadSchedule` (reads schedule tables via `scheduleHandler`).
   - `open-schema-viewer`: `onSchemaViewerClicked` -> `schema-viewer.html` -> `schemaViewerService.start` (schema fetch over IPC).

Suspected overhead (hypotheses to confirm with the baseline, not conclusions):
- H1 double parse (step 3 + 5). Likely the biggest app-side cost.
- H2 `_buildMetadata` called 2-3x per open, serialising all tables each time.
- H3 fixed 50ms `setTimeout`, plus sequential awaits that could overlap (`recentFileService.addFile`, `is-currently-searching`).
- H4 backup write of the full file (3 MB M22, 9.6 MB CFB) on the open path.
- H5 Selectr built eagerly over thousands of tables in the table editor.
- H6 `refreshCurrentPage` re-loading an editor when re-opening a file while one is already showing.

## Test inputs
| Game | File | Size |
|---|---|---|
| Madden 22 | `tests/data/m22/career/test/CAREER-E2ETEST` (copy of `career/CAREER-M22TEST`) | 3.0 MB |
| CFB 27 | `tests/data/c27/dynasty/test/DYNASTY-E2ETEST` (copy of `dynasty/DYNASTY-DYNASTY`) | 9.6 MB |

Note `tests/data/c27/` is currently untracked. Decide at implementation whether to commit it (9.6 MB x2). The harness must copy the pristine file to a temp path per run, never open the `test/` copy in place, because auto-save, backup and the watcher can touch it.
Open check: the CFB file must resolve a schema in a fresh temp profile (embedded schema, or one seeded into `<userData>/schemas`). Verify in step 1 before any timing.

## Matrix
2 files x 4 `general.defaultEditor` values (`open-home`, `open-table-editor`, `open-schedule`, `open-schema-viewer`) = 8 cells. Extra axes, run only on the default-editor cells unless a number looks odd:
- Cold (first open after launch) vs warm (second open of the same file in the same session; also covers H6 by opening while an editor is already showing).
- `autoSave` on/off (prefs applied in `openFile`).
Does the schedule editor support CFB? Check `data/navigation.json` `availableTypes`; if not, the cell is recorded as "not applicable" rather than failing.

## Instrumentation (extend the existing startup profiler, do not build a new one)
Reuse `main/services/startupProfiler.js` (MFE_PERF=1), `renderer/js/services/perfService.js` (`perfService.mark`), `scripts/perf-startup.js` (stats, percentile, hidden-window exclusion). Marks are no-ops when MFE_PERF is unset.

New marks, grouped as spans:
- Renderer: `open:requested` (click/IPC entry), `open:loader-shown`, `open:meta-prepass-start/end` (step 3), `open:openfile-ipc-start/end` (step 5), `open:tabs-generated`, `open:editor-start` (after step 7 routing), `open:editor-visible`, `open:interactive` (first paint of the editor's main content: Handsontable first render, schedule grid, schema tree, or welcome links), `open:loader-hidden`.
- Main (inside `FranchiseFileManager`): `open:parse-start` before `new FranchiseFile`, `open:parse-ready` on `ready` (this span = library time, reported as one block), `open:prefs-applied`, `open:backup-start/end`, `open:metadata-built` (with `tableCount` and serialised byte size in `detail`), plus the same around the pre-pass handler. `file-loaded` receipt and `watchFile` start/end in main.js.
- Editor-specific: `TableEditorWrapper.start` begin/`onReady` end, `getTableList` return, Selectr constructed; `scheduleService.loadSchedule` begin/end; `schemaViewerService.start` begin/end.
- Metrics to report per cell: **M-open-total** (`open:requested` -> `open:interactive`), **M-pre-pass**, **M-lib-parse**, **M-app-overhead** (= total - lib-parse - user waits), **M-editor-ready**, IPC payload bytes, longtasks during open (reuse the `longtask` observer), main event-loop delay (reuse `monitorEventLoopDelay`).
- Bonus (cheap): an IPC timing wrapper in `main/utils/ipcLogger.js` that records duration per channel while MFE_PERF=1, so every IPC call in the open window shows up without hand-placed marks.

## Harness
New `scripts/perf-file-open.js`, modelled on `scripts/perf-startup.js` (reuse its `stats`, `percentile`, hidden-run exclusion, output layout `test/perf-results/<stamp>-<label>-<sha>/`):
- Launch Electron with a seeded temp profile (as the startup harness does; preferences come from `buildTestPreferences` in `tests/e2e/util/Electron.js`, extend to set `defaultEditor`, `autoSave`, and keep update/schema checks off).
- Drive the open without native dialogs via `NODE_ENV=testing` + `TestUtility` `#open-file-input` hook (renderer/js/services/test-utils/TestUtility.js:21), invoked through Playwright `_electron` (already a dependency). Alternative if that perturbs timing: a `MFE_PERF_OPEN=<path>` env var that makes the renderer call `welcomeService.openFileFromPath` itself after `welcome-interactive`. Prefer the env var; it avoids Playwright overhead in the measured window.
- Per run: copy pristine file to temp, open it, wait for `open:interactive`, collect JSON, optionally do the warm second open, quit. 10 measured runs + 1 warmup per cell, as in startup. Flags: `--file m22|c27|both`, `--editor <value>|all`, `--runs N`, `--warm`, `--autosave on|off`, `--label`.
- Output `summary.md`: one table, 8 rows (file x editor) with median / p90 / min for each metric, plus the cold/warm and autosave extras.
- Same measuring gotchas as startup: keep the screen on (hidden/occluded runs are dropped and warned), dev vs packaged userData differ, compare same-flag runs only.

## Steps
0. Copy this plan to `.claude/plans/file-open/plan.md`; add `file-open-baseline-contract.md` next to it (mark names, metric definitions, JSON shape), like `startup-baseline-contract.md`.
1. Sanity: open each file manually in dev, confirm schemas resolve (esp. CFB) and the 4 editors load for both; note any unsupported cell.
2. Add marks + IPC timing (no behaviour change). Verify with `npm run test:unit` and a couple of e2e specs (`npm run e2eTest` for the full run before commit).
3. Write `scripts/perf-file-open.js`; smoke-run 2 cells.
4. Run the full matrix, commit results table to `.claude/plans/file-open/file-open-baseline.md` with the hypotheses H1-H6 marked confirmed / rejected and the measured share each represents.
5. Review: rank overheads by median ms x frequency, and hand off a follow-up optimisation plan (not part of this work). Separate list of library-attributed time for the later `madden-franchise` pass.

One commit per step (2, 3, 4), results compared against same-flag baselines, matching how the startup effort ran.

## Out of scope
Changes to `madden-franchise` internals; any optimisation fix (including removing the double parse); startup (already covered); save/export/import timing.

## Verification
- Marks are inert without MFE_PERF=1: run `npm run test:unit` and `npm run e2eTest`.
- With MFE_PERF=1 every mandatory open mark appears in every run JSON; the harness fails a run with missing marks (as `MANDATORY_MARKS` does for startup).
- Variance check: run one cell twice with 10 runs; medians should agree within ~10% before the matrix is trusted.
- `M-app-overhead` plus `M-lib-parse` should account for ~all of `M-open-total` (gap < 5%); a large gap means a missing mark.
