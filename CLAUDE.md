# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Electron desktop app for editing Madden NFL (19–27) and College Football 27 franchise files, which use a proprietary database-like format. All parsing and writing is done by the separate **`madden-franchise`** npm library; this app is a UI wrapper around it. The front end is vanilla JS (no framework, no jQuery) that behaves like a SPA. The table editor uses Handsontable, and the table selector uses a locally modified Selectr (`renderer/js/libs/selectr`).

The app was recently upgraded from an older Electron that ran renderers with `nodeIntegration` and no preload. Expect a mix of legacy and new code. New work belongs on the IPC/preload side of that split.

## Commands

```bash
npm install                 # also runs patch-package (patches/, currently none)
npm run dev                 # sass watch + browserify watch + electron (NODE_ENV=development), with auto-reload
npm run build:renderer      # one-off browserify build of the 4 renderer bundles
npm run sass:build          # compile renderer/sass/app-manifest.scss -> renderer/css/app-manifest.css
npm run build:app           # electron-builder Windows build (publishes to GitHub releases)
npm run e2eTest             # all Playwright e2e tests (npx playwright test)
npm run test:unit           # node:test unit tests in tests/unit (no build needed)

npx playwright test tests/e2e/scripts/tabs.spec.js   # single spec file
npx playwright test -g "basic test"                  # single test by title
```

- There is no linter and no gulp. `.github/copilot-instructions.md` mentions `gulp sass:watch`, but that is outdated. Use the npm sass scripts.
- `renderer/js/bundle.js`, `renderer/js/*.bundle.js` and `renderer/css/app-manifest.css(.map)` are gitignored build outputs. Run `npm run sass:build` and `npm run build:renderer` (or `npm run dev`) before launching the app. `npm run e2eTest` and `npm run build:app` run both for you; if you call `npx playwright test` directly, build first.
- In dev, `electron-reload` watches `main.js`, `main/`, `preload/`, the bundles, the CSS and `renderer/*.html`, so the app relaunches or reloads on its own.

### Tests

- CI: `.github/workflows/test.yml` runs the unit and e2e suites on windows-latest for PRs. `nightly.yml` and `release.yml` call it and only build if it passes. When a run fails, the Playwright report and traces are uploaded as the `playwright-report` artifact.
- `npm install` sets `core.hooksPath` to `.githooks` (the `prepare` script). The `pre-push` hook there runs `npm run test:unit`, and `git push --no-verify` skips it. E2E isn't in the hook because CI runs it.
- Playwright's `testDir` is `tests/e2e`. Specs live in `tests/e2e/scripts/*.spec.js`. Page-object models are in `tests/e2e/models/` (`App`, `WelcomePage`, `TableEditorPage`, `HotComponent`, `SelectrComponent`, etc.) and helpers in `tests/e2e/util/`. Tests run with one worker.
- Tests launch `main.js` with `NODE_ENV=testing`. In that mode `navigationService` installs `renderer/js/services/test-utils/TestUtility.js`, which adds hidden `<input>` elements (`#open-file-input`, `#export-table-input`, …) so tests can drive file open, export and import without native dialogs. When you add a new dialog-driven flow that needs test coverage, add a matching hook there.
- Fixtures are in `tests/data/m22`. `TestUtil.overwriteTestCareer` copies the pristine `career/CAREER-M22TEST` over `career/test/CAREER-E2ETEST` before and after tests, so tests only ever modify the copy.
- Unit tests: `tests/unit/*.test.js` use Node's built-in `node:test`. `tests/unit/helpers/electronStub.js` stubs `require("electron")` so main-process modules load in plain Node. They are regression tests for the xlsx import/export path, the LZ4 decoder and the preferences store. The fixtures in `tests/unit/fixtures/` are compared byte for byte (`.gitattributes` keeps their line endings), so only change them for an intended behavior change.
- The top-level `tests/*.spec.js` files are legacy mocha/chai/sinon/proxyquire unit tests. Playwright doesn't pick them up, and mocha, sinon and proxyquire aren't installed.

## Architecture

### Process split

```
renderer service (vanilla JS, browserify bundle)
   → window.franchiseAPI / window.electronAPI / window.scheduleAPI   (preload/franchisePreload.js, contextBridge)
   → ipcMain.handle("<domain>:<action>")                            (main/handlers/*.js, FranchiseFileManager)
   → madden-franchise library
```

- **Main** (`main.js`): creates windows, the app menu, auto-updater, the dialog/fs IPC handlers, and a chokidar watcher that warns when the open file changes on disk. It registers every handler module through `createLoggedIpcMain` (`main/utils/ipcLogger.js`), which logs IPC in dev.
- **`main/services/FranchiseFileManager.js`** owns every `FranchiseFile` instance in `activeFiles: Map<fileId, {file, path}>`. The renderer never holds library objects. It passes a `fileId` and gets back serializable data. The schema directory is `<userData>/schemas` (APPDATA). Schema auto-detection and closest-match selection use `madden-franchise`'s `schemaPicker` against that directory, unless the file embeds its schema or the caller passes `schemaOverride`/`gameYearOverride`.
- **`main/handlers/*Handler.js`**: each module exports `register*Handlers(ipcMain, franchiseFileManager, ...)` and is wired up at the top of `main.js`. Channel names follow `domain:action`. Long-running work sends fire-and-forget events back with `webContents.send` (for example `franchise:ready`, `franchise:saved`, `franchise:error`).
- **Preload** (`preload/franchisePreload.js`): the only bridge. All windows (main, schema manager, settings manager, worker) use it with `contextIsolation: true` and `nodeIntegration: false`.
- **Adding an IPC call** takes four edits: the handler in `main/handlers/` (or `FranchiseFileManager.registerIpcHandlers`), its registration in `main.js` if it's a new module, a method on the right `contextBridge` object in the preload, and the renderer call site.

### Renderer bundling and the `electron` shim

`scripts/build-renderer.js` browserifies four entries: `index.js` → `bundle.js` (main window), `schemaManager.js`, `settingsManager.js` and `worker.js`. It maps `require("electron")` to `renderer/js/electron-shim.js` and ignores `madden-franchise` and some Node builtins. Legacy renderer code that still does `const { ipcRenderer } = require("electron")` goes through this shim. Watch for two quirks:
- `ipcRenderer.invoke(name, ...)` calls `window.franchiseAPI[name]` and treats `name` as a **preload method name**, not a channel string. Unknown names silently return `null`.
- `ipcRenderer.removeListener` removes **all** listeners on that channel.

New code should call `window.franchiseAPI` / `window.electronAPI` directly.

### SPA navigation

- `renderer/js/services/navigationService.js` is the hub. Each editor is a plain HTML fragment (`renderer/table-editor.html`, `schedule.html`, `schema-viewer.html`, `welcome.html`, …). `loadPage()` reads it over IPC and injects it into `#content`, then calls that service's `start(fileId)`. Before switching, it calls the previous service's `onClose()`.
- `data/navigation.json` defines the nav items. `availableVersions` (game years), `availableFormats` (`franchise` vs `franchise-common`) and optional `availableTypes` (`madden` vs CFB) decide which editors appear for an opened file. Each item's `menu.enable/disable` toggles app-menu items through `menuService`. Change this file to gate a feature per game version. `hiddenItems` holds editors that are disabled.

### Table editor (main feature)

- The code lives in `renderer/js/services/table-editor/`. `TableEditorWrapper` (registered as `"tableEditorService"` for nav data) owns the editor tabs, pins, external data (import/export via `ExternalDataHandler`), and the custom Handsontable cell editors and renderers in `custom-renderers/` (reference editor for foreign-key-like fields, binary blob editor). `TableEditorView` wraps a single Handsontable instance plus the Selectr table picker, the back-button history (`navSteps`), the row/column jump, and the context menu.
- Tabs: `renderer/js/services/tabs/` (`Tab`, `TableEditorTab`). Pins: `pinnedTableService.js`.
- `renderer/js/services/tableEditorService.js` is the old monolithic implementation and is mostly commented out. Don't extend it.

### Other features

- **Schedule editor** (`scheduleService.js` with `main/handlers/scheduleHandler.js`): reads the schedule tables and edits them through the library. Historical schedules are in `schedules/*.json`.
- **Schema viewer** (`schemaViewerService.js`, `schemaViewerHandler.js`), **schema manager window** (`schema-manager.html`, `schemaManager.js`), schema search over game CAS files (`schemaSearchHandler.js`, `main/libs/CASBlockParser.js`), and schema mismatch prompts (`schemaMismatchHandler.js`). The schema search doesn't work for some game versions.
- **Settings manager window** (`settings-manager.html`, `services/settings-manager/`). Preferences are stored by `main/services/preferencesStore.js` (a small JSON store that kept `electron-preferences`' file format and merge rules) with `data/preferencesSchema.json`. The renderer caches them in `preferencesService`, and changes are synced between windows over IPC.
- Recent files, external-modification reload prompts, and GitHub-release auto-updates are handled by `recentFilesHandler`, `reloadFileHandler` + the chokidar watcher in `main.js`, and `updateHandler` + `electron-updater`.

## Domain notes

- **Schemas** define every table and column for a given game version and are required to parse a file. A column type that isn't a primitive is a reference to another table. Values are strings, signed/unsigned ints, booleans, enums, raw/JSON blobs, or references.
- **Franchise vs common files**: common files hold league-wide data shared by every save and have a slightly different layout. Franchise (career) saves can reference common tables through the file's **asset table**, which maps common table IDs to reference IDs.
- `madden-franchise` usage (see `.github/skills/madden-franchise-api/SKILL.md` for detail):
  - Call `await table.readRecords()` before reading or writing fields.
  - Prefer `getTableByUniqueId()` over `getTableById()`, because IDs shift between schema versions.
  - Assign fields directly: `table.records[i][field] = value`.
  - Empty records can't be written.
- There is currently no `patches/` directory; `postinstall` runs patch-package, which is a no-op without patches. If you add one for `madden-franchise`, re-check it applies whenever you bump the library version.

## Release channels

- **Stable**: pushing to the `release` branch runs `.github/workflows/release.yml`, which builds and creates a **draft** GitHub release `v<version>` (it fails if that tag already exists). Review and publish it by hand.
- **Nightly**: every push to `master` runs `.github/workflows/nightly.yml`, which deletes and recreates one rolling `nightly` prerelease holding the exe, blockmap and `latest.yml`. It must stay a prerelease: builds from before channels existed (≤ 4.6.0) run with `allowPrerelease=false` and only look at GitHub's `/releases/latest`, which skips prereleases. Never mark the nightly as "latest" on GitHub.
- **Nightly version**: `scripts/set-nightly-version.js` (CI only, never committed) sets the version to a preview of the next stable release. If `package.json`'s version has no `v<version>` tag yet (you bumped it to `4.6.0` and haven't published), the nightly is `4.6.0-nightly.<GITHUB_RUN_NUMBER>`. Once that tag exists, it is `4.6.1-nightly.<GITHUB_RUN_NUMBER>`. Tags only exist for **published** releases, not drafts. The next stable always sorts above the nightly, so nightly users move to the next stable on their own. Leaving nightly for stable needs `allowDowngrade`.
- **Why `allowPrerelease`, not `channel`**: electron-updater 4.6.1's GitHub provider ignores `autoUpdater.channel` and always fetches `latest.yml`. The nightly workflow builds with `-c.detectUpdateChannel=false` so a prerelease version still emits `latest.yml`.
- **Do not upgrade electron-updater to 6.x** without redesigning this. Its GitHub provider skips non-semver tags, which breaks the rolling `nightly` tag.
- `build.win.publish` names the `bep713/madden-franchise-editor` repo explicitly because the git remote still uses the old `madden-schedule-editor` name. `electron-builder` is a pinned devDependency.
- `build.nsis.artifactName` is fixed to `Madden-Franchise-Editor-Setup-${version}.${ext}` (no spaces). The nightly uploads with `gh`, which keeps on-disk names, and GitHub turns spaces into dots, so the asset would no longer match the dashed URL electron-builder writes into `latest.yml`. Keep the name space-free.
