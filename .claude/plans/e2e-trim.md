# Plan: trim and tier the e2e suite

Follows `.claude/plans/e2e-speedup.md` (steps 1–3 done: sandbox, clipboard lock, parallel workers). This plan replaces that plan's steps 4–7. Its step 8 (sharding) stays a fallback.

## Goal

- Full suite: about 1,100 s → ≤ 850 s of test time; about 6 min → ≤ 3.5 min wall time locally.
- New `npm run e2eTest:quick` for local checks: ≤ 2 min wall time.
- The full suite stays the PR and merge gate. No new flaky tests.

## Baseline (11 Nov 2026, local, 3 workers, commit a400f33)

111 tests, 1,099 s of test time (including one 120 s timeout), about 6 min wall time. Per-launch cost (launch + open career) is about 2.5–3 s, so merging small tests saves little. The cost sits in these patterns:

| Pattern | Examples (s) |
|---|---|
| Whole Player table read through `evaluate` | v4 bulk-edit "pasting into empty rows" 37.6, "context menu set empty" 27.9; react context-menu "Set as next" 39.7 |
| Save, close, relaunch to check the file | react context-menu "Set as next" 39.7, v4 undo/redo 34.1, react undo/redo 28.5, save-as 13.0, empty-records ×2 ~10 each |
| Preferences toggled through the Settings window | 22 call sites, about 1–1.5 s each, plus the close hang below |
| Node-only tests run under Playwright | import-roundtrip 30 (6 tests) |
| Duplicates | ~59 (see Phase 2) |
| v4 project total | ~310 (about 30%) |

**Flake seen:** react `import.spec.js` "import table with auto un-empty enabled" timed out at 120 s. The trace shows the body finished in about 8 s. It then hung in `electronApp.close()` right after the `finally` block's `TestUtil.setAutoUnempty(app, false)` closed the Settings window. `main.js:1055` hides the Settings window and calls `preventDefault` on `close`.

Before each phase lands, re-run with the JSON reporter so its gain can be measured:
`PLAYWRIGHT_JSON_OUTPUT_NAME=<scratchpad>/results.json npx playwright test --reporter=json`
The summary script (per-test and per-file sums) is in the analysis session. Keep it as `scripts/e2e-timings.js` (Phase 5).

---

## Phase 1: Cheap fixes (no tests removed)

**1a. Read only the fields a test needs.** `App.readTable(tableId)` with no `fields` sends the whole table through `evaluate`, and the Player table has 3,960 rows.
- `tests/e2e/scripts/bulk-edit.spec.js:68` `readEmptyPlayerRows()` → `app.readTable(PLAYER_TABLE_ID, ["LastName"])`, as `react/cell-edit.spec.js` `readEmptyPlayerRows` does.
- `tests/e2e/scripts/react/context-menu.spec.js:76` `readEmptyRows(tableId)` → pass `["LastName"]` for PLAYER. OverallPercentage (4097) is small, so pass a field there too to keep one code path: `readTable(tableId, [fieldFor(tableId)])`, or give `readEmptyRows` a `field` parameter. Use the parameter.
- Leave the full Team (7482) reads alone. That table is small, and `headers` are needed.

**1b. Seed preferences at launch instead of clicking through Settings.** `launchWithDefaultOptions({ preferences })` already merges preferences (`util/Electron.js`). Test defaults already have `autoSave: []` and `autoUnempty: []`.
- Delete every `TestUtil.setAutoSave(app, false)`. It's already the default: `import.spec.js:30,94,148`, `react/import.spec.js:47,104,155`.
- Delete every reset in `finally` or at the end of a test: `bulk-edit.spec.js:99,130`, `import.spec.js:176`, `react/import.spec.js:177`. Each test has its own userData.
- `setAutoUnempty(app, true)` at the start of a test → `preferences: { general: { autoUnempty: [true] } }`: `bulk-edit.spec.js:80,104` (give `launchApp`/`openPlayerTable` a `preferences` parameter, as react `cell-edit` does), `import.spec.js:149`, `react/import.spec.js:156`.
- `setAutoOpenExcel(app, false)` → `preferences: { general: { openExcelAfterImport: [] } }` (the key in `data/preferencesSchema.json:84`): `export.spec.js:31`, `react/export.spec.js:33`, `react/inverted-edit.spec.js:297`. Check the shape of the default (array vs boolean) in the schema before writing it.
- **Keep** the UI toggles that are what the test checks: `import.spec.js:59` and `react/import.spec.js:77` (turning on auto-save mid-test), and `empty-records.spec.js:77,89` (v4, toggles mid-test to test both settings in one test).
- Keep `TestUtil.setAutoSave/setAutoUnempty/setAutoOpenExcel`. They're still used.

**1c. Banner wait.** `react/notifications.spec.js` "the drawer link sets the pending file and Cancel clears it" waits up to 12 s for the banner to hide on its own (`banner.waitForHidden({ timeout: 12 * 1000 })`). Close it with the banner's Close button instead (`Banner` model, or `app.dismissBanners()`). The previous test, "the banner hides on its own…", still covers the auto-hide. First check that closing the banner doesn't remove the drawer item. If it does, keep the wait.

**Gate:** `npx playwright test --repeat-each=2` is green. The edited specs are faster in the JSON report. The react import "auto un-empty" test passes 5/5 with `--repeat-each=5 -g "auto un-empty"`.

## Phase 2: Remove duplicates, move Node-only tests

**2a. Move `tests/e2e/scripts/import-roundtrip.spec.js` → `tests/unit/importRoundtrip.test.js`** (node:test + `node:assert/strict`, like `externalData.test.js`).
- It needs no `electronStub`: it only `require`s `externalDataHandler` and `madden-franchise`. Check that `externalDataHandler` loads without the stub. Otherwise `require("./helpers/electronStub")` first, as `externalData.test.js` does.
- It reads `tests/data/m22/career/CAREER-M22TEST` (the pristine file) directly. Inline the path or add it to a small unit helper. Don't `require` the e2e `FilePaths`.
- Cost: the 4220 cases take about 12–14 s each, which slows the pre-push hook (`.githooks/pre-push` runs `test:unit`). Measure `npm run test:unit` before and after. If the hook grows by more than 15 s, drop the `autoUnempty` loop for 7482 and 4104 (no empty records, so it adds nothing there) and keep both variants only for 4220. **Decision for you if it is still slow:** accept the cost, or keep 4220 in e2e.
- Delete the e2e spec.

**2b. Delete duplicate tests:**

| Delete | Covered by |
|---|---|
| `bulk-edit.spec.js` "the context menu can set a record as empty" | v4 `empty-records.spec.js` (empties through the context menu) |
| `bulk-edit.spec.js` "single-cell edits are saved to the file" | v4 `smoke.spec.js` (edit, save, reopen) |
| `react/cell-edit.spec.js` "the context menu can set a record as empty (react)" | `react/empty-records.spec.js` test 1 and `react/context-menu.spec.js` "Set as empty works on a record column in the inverted view" (same `setSelectedRecordToEmpty`) |
| `pins.spec.js` "pins are matched by uniqueId and legacy pins are migrated" | `react/pins.spec.js` twin plus `tests/unit/pinnedTableService.test.js`. The migration runs in main. |

If deleting the first two leaves an unused helper in `bulk-edit.spec.js` (`readEmptyPlayerRows`), remove it. The same goes for `pins.spec.js` imports (`fs`, `path`, `playwrightExpect`).

**Not merged on purpose:** the 13 `notifications` tests and the 8 `external-change` tests each cost only about 2.5–6 s and check one behavior each. Merging them would save about 3 s per test and make failures harder to read.

**Gate:** `npm run test:unit` and `npx playwright test` are green. The test count drops by 10 (6 moved, 4 deleted).

## Phase 3: Check saved files on disk instead of relaunching

**3a. New `tests/e2e/util/diskReader.js`:**
- `readTableFromDisk(filePath, tableId, fields?) → Promise<{ records, emptyRecordIndices, header } | null>`
- It generalizes `readPlayerFieldFromDisk` (`react/cell-edit.spec.js:72`): `FranchiseFile.create(filePath, { schemaDirectory: <mkdtemp>, saveOnChange: false })`, then `getTableById`, then `readRecords()`.
- `records` is trimmed to `fields`, like `App.readTable`. `emptyRecordIndices` comes from `table.emptyRecords` keys, sorted as numbers, the same way main does (`FranchiseFileManager._serializeEmptyRecordIndices`, `:285`). `header` is `{ nextRecordToUse: table.header.nextRecordToUse }`.
- It returns `null` while the file can't be parsed (mid-write), so callers can `poll`, as the existing helper does. It removes the temp schema dir in `finally`.
- Measure one Player-table read. If parsing is slow (more than about 3 s), cache the parsed schema per worker. The schema comes from `madden-franchise`'s bundled set. Don't build the cache unless the measurement calls for it.
- `react/cell-edit.spec.js` `readPlayerFieldFromDisk` becomes a thin wrapper around it, or is replaced by it.

**3b. Replace relaunches** (after `app.saveFile()`, assert on `readTableFromDisk(careerPath, …)` instead of `electronApp.close()` + relaunch):
- `react/cell-edit.spec.js` "undo and redo after a bulk paste…": both `saveAndReopenPlayerTable` calls. Redo continues in the same session. Remove `saveAndReopenPlayerTable` once it's unused. Drop `test.setTimeout(180s)` if the test then fits in the default.
- `bulk-edit.spec.js` (v4) "undo and redo…": the same.
- `react/context-menu.spec.js` "Set as next empty record to use…": the part from "it survives a save and reopen" on becomes a disk read of `header.nextRecordToUse` and `emptyRecordIndices`. Before switching, check that the library's `header.nextRecordToUse` on a fresh parse equals what `app.readTable` returned in-session. If not, compare the raw first-4-byte pointer instead.
- `react/empty-records.spec.js` tests 1 and 4: replace the "keeps them after a save and reopen" sections with disk reads. Test 1 then un-empties in the same session, not on `reopened`.
- `react/inverted-edit.spec.js` "export and import from the inverted view…" step 9: a disk read for the value. The check that "a reopened table starts normal" is about UI state, not the file. Keep it in the same session by re-opening the table in a new tab (`ctrlClickSidebarTable`) and checking `isInverted() === false`. The test "the orientation belongs to the tab's current table" already covers that, so the step can also simply be dropped. Drop it.
- `react/save.spec.js` "save as writes a copy and leaves the original": its two extra launches become `readTableFromDisk(savePath, 7482, ["LongName"])` and the same for `careerPath`.

**Keep real reopens in the app:** `react/save.spec.js` "edit, save, close and reopen" (React), v4 `smoke.spec.js` (v4), and both import specs' "fields persist after saving" (they use close-file + reopen in the same app, which is cheap). That keeps the reopen path covered.

**Gate:** the edited specs pass with `--repeat-each=3`. Each edited test is at least 40% faster in the JSON report.

## Phase 4: Measure tracing and worker count

Measure first. Each change lands only if the numbers justify it.

**4a. Tracing.** `util/Electron.js:96` starts tracing with `{ screenshots: true, snapshots: true }` on every launch. Run `react/cell-edit` and `react/context-menu` 3 times each, with and without it (temporary env flag), and compare.
- If it costs ≥ 5%: add `options.trace` (default `true`). Tests pass `trace: testInfo.retry > 0` through a fixture. The simplest form: `launchWithDefaultOptions` reads `test.info().retry` itself when it's called inside a test, so specs don't change. The `failureArtifacts` fixture skips `tracing.stop` when tracing never started, and still takes the screenshot.
- Then set CI to `retries: 1` (currently 2) so a failure gets one traced retry.
- If it costs < 5%, change nothing and note the number here.

**4b. Local workers.** This machine has 12 logical cores, and the local default is 3. Run the full suite at `E2E_WORKERS=4`, `5` and `6`, each with `--repeat-each=2`. Pick the highest count with 0 failures and 0 flakes, and with wall time still dropping. Set that as the local default in `playwright.config.js`, and update the `CLAUDE.md` Tests note (currently "3 workers locally"). CI stays at 2 (4 vCPU).
- Watch `MAX_BULK_PASTE_MS = 15000` (in react `cell-edit` and `inverted-edit` and in v4 `bulk-edit`) under the higher load. If it fails, use the next lower worker count. Don't raise the limit.

**Gate:** the numbers are recorded in this file. The suite is green twice at the chosen worker count.

## Phase 5: Quick local subset

**5a. Tag `@slow`** (append ` @slow` to the test title). Tag a test if it takes ≥ 15 s after Phases 1–3, or if it's a large-data performance or import/export test whose code rarely changes. Current candidates (confirm with the Phase 3 timings):
- react `cell-edit`: "pasting 2,500 cells…", "undo and redo after a bulk paste…", "fast edits and a fast double undo with autoSave…"
- react `inverted-edit`: "pasting 2,500 records…", "export and import from the inverted view…"
- react `import` (both tests), react `export`

**5b. Selection in `playwright.config.js`** keyed on `process.env.E2E_QUICK`:
- `react` project: `grepInvert: /@slow/` when quick.
- `v4` project: `testMatch: "**/smoke.spec.js"` when quick, so only the v4 smoke runs and still checks that v4 boots and edits.
- Project-level `grepInvert`/`testMatch` exist in `@playwright/test` 1.25. Check by listing with `npx playwright test --list` and `E2E_QUICK=1`.

**5c. Script.** `package.json`: `"e2eTest:quick": "npm run build:react && cross-env E2E_QUICK=1 npx playwright test"`. `cross-env` is already a devDependency. The v4 bundles must exist for v4 smoke. Like `e2eTest:react`, it doesn't rebuild them. Document that `npm run build:renderer` is needed after v4 changes.

**5d. `scripts/e2e-timings.js`.** `node scripts/e2e-timings.js <results.json>` prints the test count, the per-test list sorted by time with status, and per-file sums. It's the analysis script from 11 Nov, so the next trim starts from real numbers. Document the command next to it in CLAUDE.md.

**5e. Docs.** In CLAUDE.md Commands, add `e2eTest:quick`. In Tests, add: the `@slow` tag rule, that the quick run is for local checks and CI always runs the full suite, the `diskReader` helper ("assert saved files with `readTableFromDisk`, don't relaunch"), and "seed preferences with `launchWithDefaultOptions({ preferences })`, don't click through Settings, unless the toggle is what you're testing".

**Gate:** `npm run e2eTest:quick` is green and takes ≤ 2 min wall time. `--list` shows no `@slow` tests and only v4 smoke from v4.

## Phase 6: Full v4 project on nightly and release only (approved)

What runs today: `test.yml` (PRs), `nightly.yml` (every push to master) and `release.yml` all run the full suite through `build-and-test`.

**Decision (approved 11 Nov 2026):** PRs run the full React project plus v4 smoke and pins. `nightly.yml` and `release.yml` still run the full v4 project. Both run tests in the same job as electron-builder, so a v4 failure still blocks every installer. That's the guarantee that matters, and v4 stays in CI. It saves about 250 s of PR test time, or about 2 min of wall time at 2 workers.

- A `quick-v4` input (default `false`) on `.github/actions/build-and-test/action.yml`. When it's `true`, the Playwright step sets `E2E_V4_SMOKE=1`, and the v4 project's `testMatch` becomes `["**/smoke.spec.js", "**/pins.spec.js"]` (the same mechanism as 5b, but a separate variable from `E2E_QUICK`). The v4 build steps (`sass:build`, `build:renderer`) still run, because v4 smoke needs them.
- `test.yml` passes `quick-v4: true`. `nightly.yml` and `release.yml` leave it unset.
- `workflow_dispatch` on `test.yml` also uses the quick v4 set. A full run on demand is a manual dispatch of `nightly.yml`, but that also publishes the nightly. If a full test-only run is wanted later, add a `full` boolean dispatch input to `test.yml`. Not part of this plan.
- CLAUDE.md:
  - Intro: "the `v4` e2e project stays in CI" → "the full `v4` e2e project runs on nightly and release builds (PRs run v4 smoke and pins)".
  - Tests → CI paragraph: describe the `quick-v4` input and which workflow runs what.

**Gate:**
- A PR run lists only React tests plus v4 `smoke` and `pins` (check the `list` reporter output in the Actions log).
- The next push to master (nightly) runs every v4 test.

---

## Order and size

| Phase | Size | Expected gain (test time) | Depends on |
|---|---|---|---|
| 1 | small, mechanical | ~70–90 s, plus the close-hang flake | — |
| 2 | small | ~60 s (30 s moves to unit) | — |
| 3 | medium | ~60–80 s | 1 (preference changes touch the same specs) |
| 4 | measurement | 0–10% (tracing); 25–40% wall time (workers) | 1–3, so the numbers are stable |
| 5 | small | quick run ≤ 2 min | 3, for final timings |
| 6 | small (approved) | ~2 min PR wall time | 5 (same config mechanism) |

Phases 1 and 2 touch different tests and can go in parallel or in one commit. Each phase lands green on its own.

## Files touched

- Phase 1: `tests/e2e/scripts/{bulk-edit,import,export}.spec.js`, `tests/e2e/scripts/react/{context-menu,import,export,inverted-edit,notifications}.spec.js`
- Phase 2: `tests/e2e/scripts/import-roundtrip.spec.js` (removed), `tests/unit/importRoundtrip.test.js` (new), `tests/e2e/scripts/{bulk-edit,pins}.spec.js`, `tests/e2e/scripts/react/cell-edit.spec.js`
- Phase 3: `tests/e2e/util/diskReader.js` (new), `tests/e2e/scripts/bulk-edit.spec.js`, `tests/e2e/scripts/react/{cell-edit,context-menu,empty-records,inverted-edit,save}.spec.js`
- Phase 4: `tests/e2e/util/Electron.js`, `tests/e2e/util/test.js`, `playwright.config.js`, `CLAUDE.md`
- Phase 5: `playwright.config.js`, `package.json`, `scripts/e2e-timings.js` (new), a few spec titles, `CLAUDE.md`
- Phase 6: `.github/actions/build-and-test/action.yml`, `.github/workflows/test.yml`, `playwright.config.js`, `CLAUDE.md`

## Out of scope

- Merging the small `notifications` and `external-change` tests (reason in 2b).
- The v4 and react `export` specs (38.8 s and 25.5 s): check where their time goes (the full FRT export?) before changing anything. If Phase 5 doesn't tag them `@slow`, do it as a follow-up.
- The schema-management "top row lines up" failure at CI window size (already known, from the old plan).
- Sharding (old plan step 8): only if CI wall time is still a problem after Phase 6.
