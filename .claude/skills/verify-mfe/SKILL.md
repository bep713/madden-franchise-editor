---
name: verify-mfe
description: Launch and drive the real Madden Franchise Editor Electron app (v5 React UI by default, or legacy v4) on an isolated copy of the M22 career fixture, exercise a feature the way a user would (open file, table editor edits/save, export/import, schedule editor, schemas), and capture screenshots, ARIA snapshots, a Playwright trace and on-disk proof. Use this to prove a change works in the running app, beyond vitest/e2e specs, or to reproduce a UI bug.
---

# verify-mfe: drive the real Madden Franchise Editor

The app is an Electron desktop app. Scripts in this skill drive it through the repo's own Playwright e2e harness (`tests/e2e/util/Electron.js`, the page models in `tests/e2e/models/react/`). Each run launches **its own** app instance and closes it at the end. There is no long-lived server to attach to, and you never drive the user's own running copy.

All commands run from the repo root (`C:\Projects\madden-franchise-editor`). Each run is isolated:
- its own `--user-data-dir` (`%TEMP%\mfe-e2e-XXXX`), seeded with test preferences: no first-run pages, update/schema checks off, auto-save off. It is deleted when the app closes.
- its own copy of `tests/data/m22/career/CAREER-M22TEST`, at `%TEMP%\mfe-e2e-sandbox-XXXX\CAREER-E2ETEST`. The fixture itself is never opened.
- `NODE_ENV=testing`, which swaps in the fake updater, so nothing hits the network.

So several runs can go in parallel, and they can run next to `npm run dev` or an e2e run. They do share the OS clipboard (see Gotchas).

## 1. Build (launch prerequisites)

The app loads built files, not sources:

```bash
npm run build:react                          # after any change under src/ or data/ (React UI)
npm run sass:build && npm run build:renderer # only when driving --ui v4 after renderer/ changes
```

Main-process code (`main.js`, `main/`, `preload/`) is loaded directly and needs no build.

## 2. Doctor (run first, and whenever anything looks off)

```bash
node .claude/skills/verify-mfe/scripts/doctor.js            # React UI
node .claude/skills/verify-mfe/scripts/doctor.js --ui v4    # legacy UI
```

It is read-only. It checks `node_modules` (playwright, electron, madden-franchise), the fixture, and whether the build is **fresh**: it fails if any file under `src/` or `data/` is newer than `out/renderer/index.html`. It also lists Electron main processes still running with an `mfe-e2e-` profile. It ends with `READY` (exit 0) or `NOT READY` (exit 1). Fix every FAIL before driving. A stale build means you would be verifying old code.

## 3. Drive: write a scenario and run it

A scenario is a CommonJS file that exports one async function. Put throwaway scenarios in your scratchpad, and reusable ones in `.claude/skills/verify-mfe/scenarios/`.

```bash
node .claude/skills/verify-mfe/scripts/drive.js <scenario.js> [--ui react|v4] [--run-id <id>] \
     [--prefs '{"general":{"autoSave":[true]}}'] [--env '{"MFE_UPDATE_CHECK_DELAY_MS":"0"}'] \
     [--keep-sandbox] [--no-trace]
```

The app is ready once the log shows `main window ready`. By then the Welcome page heading "Madden Franchise Editor" is visible. The run ends with `Status: passed|failed` (exit 0 or 1) and the evidence path. The app is always closed before the script exits.

The scenario receives `ctx`:

| key | what |
|---|---|
| `electronApp` | Playwright `ElectronApplication`. `electronApp.evaluate(({ Menu, dialog }) => …)` runs in main |
| `app` | `tests/e2e/models/App.js`: `clickMenuItem(id)` (app-menu ids such as `Save`, `SaveAs`, `CloseFile`, `Export`, `Import`, `ExportRawTable`), `readTable(tableId, fields)` (data from the open file over IPC), `findTableIdByName`, `isMenuItemEnabled`, `pasteText(window, text)` |
| `window` | the main window `Page` |
| `models` | React: `welcome`, `nav`, `tableEditor` (with `.grid`), `schedule`, `schemas`, `schemaViewer`. v4: `welcome`, `tableEditor` |
| `sandbox` | `{ dir, careerPath, exportPath, rawExportPath, frtkExportPath }` |
| `stubs` | `stubOpenDialog(electronApp, path)`, `stubSaveDialog`, `stubMessageBox(electronApp, buttonIndex)`, `openDialogCalls`, `messageBoxCalls` |
| `poll(fn, predicate, { timeout, message })` | the way to wait. **Not** `expect(locator)` (see Gotchas) |
| `readSavedTable(path, tableId, fields)` | parses a franchise file on disk **in the driver process**, giving independent proof of a save |
| `shot(name)` | writes `NN-name.png` + `NN-name.aria.txt` (ARIA snapshot of the body) to evidence |
| `log(...)` | appends to `log.txt` and stdout |
| `keep(path, name?)` | copies a file (saved career, export) into evidence |
| `e2e(rel)` | `require` relative to `tests/e2e/` for anything else (`models/react/ContextMenu.js`, `util/FileCompare.js`, …) |

Throw to fail. Minimal example:

```js
module.exports = async ({ electronApp, models, sandbox, shot, log }) => {
  await models.welcome.openFranchiseFile(electronApp, sandbox.careerPath); // stubs the open dialog, clicks "Open a file..."
  await models.welcome.openTableEditor();
  await models.tableEditor.waitForTableToLoad();
  await models.tableEditor.openTableById(7482);                            // "7482 - Team"
  log(await models.tableEditor.getSelectedTableName());
  await shot("team-table");
};
```

The proven reference scenario is `.claude/skills/verify-mfe/scenarios/table-edit-save.js`. It edits a cell, saves, and checks the value on disk.

Handles to prefer, all from the shipped page models: roles and text (`getByRole("tab", …)`, "Open the table editor"), and `data-*` attributes (`[role="tab"][data-name="Home"]`, `button[data-table-id="7482"]`, `[data-action="EXPORT"]`, `button[data-week]`, `[data-record-index]`, `[data-field]`). Never select on CSS-module class names, because they are hashed in the build. Native file dialogs don't exist in a run. Stub them with `stubs.*` before the click that opens them.

The per-feature recipes are in `features/README.md`. Read it before you drive.

## 4. Evidence

Everything goes to `test/verify-evidence/<runId>/` (gitignored). The default runId is `<yyyymmdd-hhmmss>-<scenario>`.

- `run.json`: status, error stack, pid, userData and sandbox paths, timestamps.
- `log.txt`: every `log()` line plus the driver's lifecycle lines.
- `NN-<name>.png` / `.aria.txt`: one pair per `shot()`.
- `failure.png` / `failure.aria.txt`: written automatically on a failure.
- `trace.zip`: a Playwright trace, unless `--no-trace`. Open it at https://trace.playwright.dev (the local `show-trace` is the wrong version).
- Any file you `keep()`.

Proof standards:
- Drive the user's path: clicks, typing and the app menu (`app.clickMenuItem`, which is what the menu does). Use `window.franchiseAPI.*` / `app.readTable` only to *read* state, never to perform the action under test.
- Shoot before **and** after the action, not only the end screen.
- Check side effects: after a save or import, read the file back with `readSavedTable` (a separate parse in the driver), and `keep()` exports. Check `pins.json` and preferences in `run.userDataDir` **before** the scenario returns, because that folder is deleted when the app closes.
- The only stubs are at production boundaries: native dialogs (`stubs`), and the updater, which is already fake in testing mode. Saying the dialog flow works means the stub accepted the path. A real OS dialog is never exercised.

## 5. Cleanup

`drive.js` closes its app and deletes its sandbox and userData on every exit path. If a run was killed (Ctrl+C, timeout, crash), run:

```bash
node .claude/skills/verify-mfe/scripts/cleanup.js            # every run under test/verify-evidence
node .claude/skills/verify-mfe/scripts/cleanup.js --run <id> # one run
```

For each `run.json`, it kills that run's pid (`taskkill /T`) only if the process's command line still contains that run's userData dir, then removes its userData and sandbox folders. It never kills by process name and never deletes evidence. Afterwards, `doctor.js` should report no leftover processes. An `mfe-e2e-` process that doctor lists but cleanup doesn't know about belongs to someone else (an e2e run, a teammate's shell), so leave it alone.

Delete old evidence folders by hand when you no longer need them.

## Gotchas

- **Stale build = false result.** Always run doctor. `npm run build:react` takes about 30–60 s.
- `expect(locator)` from `@playwright/test` 1.25 can't drive the `playwright` 1.59 Electron page. Wait with `locator.waitFor()` or `poll`.
- Synthesized keys don't trigger Electron menu accelerators: Ctrl+S does nothing. Use `app.clickMenuItem("Save")`.
- Auto-save is **off** by default, so edits reach the file only after Save. Pass `--prefs '{"general":{"autoSave":[true]}}'` to test auto-save.
- Excel export/import: pass `--prefs '{"general":{"openExcelAfterImport":[]}}'`, or the app opens Excel.
- The OS clipboard is shared with other runs and e2e workers. Paste with `app.pasteText(window, text)`, which takes the cross-process lock.
- The table sidebar is virtualized. Use `tableEditor.openTableById(id)` (it searches first), not scrolling. The grid is virtualized too, so use `grid.selectCell(row, column, headers)` with `headers` from `app.readTable(id)`. Don't pass `readTable(4220)` (Player) without `fields`, because it returns about 12 s of data.
- Banners (schema mismatch, etc.) overlay the bottom of the page. `welcome.openFranchiseFile` dismisses them, and `app.dismissBanners()` does it by hand.
- At small window sizes the layout differs (CI is 1024x768). Set `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728` before `drive.js` to reproduce it.
- `--ui v4` uses the legacy models (`tests/e2e/models/*.js`, Selectr/Handsontable 11) and v4 `TestUtility` hooks. The recipes in `features/` are written for React.
