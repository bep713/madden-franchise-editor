# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Electron desktop app for editing Madden NFL (19–27) and College Football 27 franchise files, which use a proprietary database-like format. All parsing and writing is done by the separate **`madden-franchise`** npm library; this app is a UI wrapper around it. The front end is vanilla JS (no framework, no jQuery) that behaves like a SPA. The table editor uses Handsontable, and the table selector uses a locally modified Selectr (`renderer/js/libs/selectr`).

The app was recently upgraded from an older Electron that ran renderers with `nodeIntegration` and no preload. Expect a mix of legacy and new code. New work belongs on the IPC/preload side of that split.

This branch (`v5-react-conversion`) is also building a v5 React/TypeScript UI in `src/` next to the v4 UI (see "v5 React UI" below). Both run against the same main process. v5 is the default; v4 is "legacy" and is kept indefinitely. v4 gets no new features, but changes to main, preload or IPC must keep it working, and the `v4` e2e project stays in CI.

## Commands

```bash
npm install                 # also runs patch-package (patches/, currently none)
npm run dev                 # sass watch + browserify watch + electron (NODE_ENV=development, MFE_UI=v4 forces v4), with auto-reload
npm run build:renderer      # one-off browserify build of the 3 renderer bundles
npm run sass:build          # compile renderer/sass/app-manifest.scss -> renderer/css/app-manifest.css
npm run build:app           # electron-builder Windows build (publishes to GitHub releases)
npm run e2eTest             # all Playwright e2e tests, v4 + React (builds both UIs first)
npm run e2eTest:react       # build:react + only the React specs (--project=react)
npm run e2eTest:quick       # build:react + React specs without @slow + v4 smoke only (E2E_QUICK=1)
npm run test:unit           # node:test unit tests in tests/unit (no build needed)

# v5 React UI (src/)
npm run dev:react           # Vite dev server (127.0.0.1:5173, HMR) + electron with MFE_RENDERER_URL
npm run build:react         # vite build -> out/renderer
npm run start:react         # electron with MFE_UI=react (loads out/renderer/index.html)
npm run typecheck           # tsc -b (tsconfig.web.json + tsconfig.node.json)
npm run test:react          # vitest (jsdom) for src/**/*.test.*
npm run lint                # eslint src
npm run stylelint           # stylelint src/**/*.{css,scss}
npm run format              # prettier --write src
npm run storybook           # Storybook on :6006 (stories are src/**/doc/*.stories.jsx)

npx playwright test tests/e2e/scripts/tabs.spec.js   # single spec file
npx playwright test -g "basic test"                  # single test by title
```

- ESLint/Prettier/Stylelint only cover `src/` (v5). The v4 code (`main/`, `preload/`, `renderer/`) has no linter, and there is no gulp. `.github/copilot-instructions.md` mentions `gulp sass:watch`, but that is outdated. Use the npm sass scripts.
- `renderer/js/bundle.js`, `renderer/js/*.bundle.js` and `renderer/css/app-manifest.css(.map)` are gitignored build outputs. Run `npm run sass:build` and `npm run build:renderer` (or `npm run dev`) before launching the app. `npm run e2eTest` and `npm run build:app` run both for you; if you call `npx playwright test` directly, build first (and `npm run build:react` for the React specs).
- In dev, `electron-reload` watches `main.js`, `main/`, `preload/`, the bundles, the CSS and `renderer/*.html`, so the app relaunches or reloads on its own.

### Tests

- CI: the composite action `.github/actions/build-and-test` runs `npm ci`, the unit suite, the v5 typecheck/lint/vitest/`build:react`, the v4 renderer build and the e2e suite. `test.yml` runs it for PRs; `nightly.yml` and `release.yml` run it in the same job as electron-builder, so dependencies and the renderer are built once and the installer is only built if tests pass. When a run fails, the Playwright report and `test/playwright-test-results/` are uploaded as the `playwright-report` artifact.
- `npm install` sets `core.hooksPath` to `.githooks` (the `prepare` script). The `pre-push` hook there runs `npm run test:unit`, `npm run lint` and `npm run test:react`, and `git push --no-verify` skips it. E2E isn't in the hook because CI runs it.
- Playwright's `testDir` is `tests/e2e`. Specs live in `tests/e2e/scripts/*.spec.js`. Page-object models are in `tests/e2e/models/` (`App`, `WelcomePage`, `TableEditorPage`, `HotComponent`, `SelectrComponent`, etc.) and helpers in `tests/e2e/util/`. Tests run in parallel (`fullyParallel`) with 5 workers locally and 2 on CI; `E2E_WORKERS=n` (or `--workers=n`) overrides. Every test launches its own app with its own userData dir and sandbox, so a new spec must not write to a shared path, and specs must not share an app between tests (no `beforeAll` launches). The OS clipboard is shared by all workers: paste with `App.pasteText(window, text)`, which holds the cross-process lock in `util/clipboardLock.js` for the copy + Ctrl+V.
- Specs import `test` from `tests/e2e/util/test.js`, not `@playwright/test`. Its auto fixture saves `failure.png` for a failed test into `test/playwright-test-results/<test>/`, plus `trace.zip` when the run was traced. Playwright's own `trace` option does nothing for `_electron.launch()`, so `Electron.js` starts tracing itself, only on a retry, because tracing adds about 20% to test time. CI retries once, so a CI failure comes with a trace in its `-retry1` folder. Locally, set `E2E_TRACE=1` to trace every launch, or pass `trace: true` to `launchWithDefaultOptions`. The trace is written by `playwright` 1.59 while `@playwright/test` is 1.25, so open it at trace.playwright.dev rather than with `npx playwright show-trace`.
- The CI runner's display is 1024x768 at 100% scale, so windows there are much smaller than on a dev machine. To reproduce CI layout issues locally, run with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728` (handled in `Electron.js` and `models/App.js`).
- Tests launch `main.js` with `NODE_ENV=testing`. In that mode `navigationService` installs `renderer/js/services/test-utils/TestUtility.js`, which adds hidden `<input>` elements (`#open-file-input`, `#export-table-input`, …) so tests can drive file open, export and import without native dialogs. When you add a new dialog-driven flow that needs test coverage, add a matching hook there.
- Quick run: `npm run e2eTest:quick` sets `E2E_QUICK=1`, and `playwright.config.js` then skips React tests whose title ends in ` @slow` and runs only `smoke.spec.js` from v4. It's for local checks; CI always runs the full suite. Like `e2eTest:react`, it doesn't rebuild the v4 bundles, so run `npm run build:renderer` after v4 changes. Tag a test `@slow` (append it to the title) if it takes ≥ 15 s, or if it's a large-data, performance or import/export test whose code rarely changes.
- Check a saved file with `readSavedTable` / `readTableFromDisk` (`util/diskReader.js`), which parse it in the test process. Don't close and relaunch the app to check what was saved.
- Seed preferences with `launchWithDefaultOptions({ preferences })`. Don't click through the Settings window (`TestUtil.setAutoSave` etc.) unless the toggle is what the test checks.
- Timings: run `PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/results.json npx playwright test --reporter=json`, then `node scripts/e2e-timings.js <dir>/results.json` prints every test sorted by time and the per-file sums.
- Fixtures are in `tests/data/m22`. Tests never open them directly: the `sandbox` fixture (`util/test.js`, `util/sandbox.js`) copies the pristine `career/CAREER-M22TEST` into a per-test temp folder and gives `{ dir, careerPath, exportPath, rawExportPath, frtkExportPath }`. Specs take it in a `beforeEach` or the test (`async ({ sandbox }) => …`) and open `sandbox.careerPath`.
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
- **`main/services/FranchiseFileManager.js`** owns every `FranchiseFile` instance in `activeFiles: Map<fileId, {file, path}>`. The renderer never holds library objects. It passes a `fileId` and gets back serializable data. The schema directory is `<userData>/schemas` (APPDATA). Schema auto-detection and closest-match selection use `madden-franchise`'s `schemaPicker` against that directory, unless the file embeds its schema or the caller passes `schemaOverride`/`gameYearOverride`. Writes, saves and schema reloads for a file run one at a time through `_runExclusive(fileId, fn)`. Auto-save is `requestAutoSave(fileId)`: the entry's `autoSave` flag decides, requests share one queued save, and the library's own `saveOnChange` always stays off.
- **`main/handlers/*Handler.js`**: each module exports `register*Handlers(ipcMain, franchiseFileManager, ...)` and is wired up at the top of `main.js`. Channel names follow `domain:action`. Long-running work sends fire-and-forget events back with `webContents.send` (for example `franchise:ready`, `franchise:saved`, `franchise:error`).
- **Preload** (`preload/franchisePreload.js`): the only bridge. All windows (main, schema manager, settings manager) use it with `contextIsolation: true` and `nodeIntegration: false`.
- **Adding an IPC call** takes four edits: the handler in `main/handlers/` (or `FranchiseFileManager.registerIpcHandlers`), its registration in `main.js` if it's a new module, a method on the right `contextBridge` object in the preload, and the renderer call site.

### Renderer bundling and the `electron` shim

`scripts/build-renderer.js` browserifies three entries: `index.js` → `bundle.js` (main window), `schemaManager.js` and `settingsManager.js`. It maps `require("electron")` to `renderer/js/electron-shim.js` and ignores `madden-franchise` and some Node builtins. Legacy renderer code that still does `const { ipcRenderer } = require("electron")` goes through this shim. Watch for two quirks:
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

### v5 React UI

- Code: `src/renderer/` (Vite root; `index.html` → `src/main.tsx`), shared TS types in `src/shared/`, and nav/game data in `data/navigation.ts` and `data/games.json` (`games.json` is also `require`d by main). Aliases: `@renderer`, `@shared`, `@assets`, `@data` (in `vite.config.mts` and `tsconfig.web.json`). CSS modules use camelCase class names; `*.svg?react` imports go through svgr.
- Only `index.html` is built. `schema.html` and `settings.html` still point at v4 scripts.
- The `general.uiVersion` preference (`"v5"` / `"v4"`) picks the main window's UI (`main/utils/uiSelection.js`, `loadMainUi()` in `main.js`); the default is `"v5"`. `MFE_RENDERER_URL` (dev server) or `MFE_UI=react` force v5 and `MFE_UI=v4` forces v4, for that session only. v5 loads the dev server URL if set, else `out/renderer/index.html`, and falls back to v4 with a console warning if that's missing.
- Switching is live: View → Interface (radio items `UiVersionV5`/`UiVersionV4`) or changing the preference anywhere runs `switchMainUi()`, which reloads only the main window's page and clears the env override. The open file, its unsaved edits, the watcher and the title stay in main. The update check runs on the first load only; a reloaded UI reads the last updater event with `electronAPI.getUpdateStatus()`.
- Updates: `main/services/updateController.js` owns the updater state and tags each check `{ manual }` (startup checks are automatic; the menu and an update-channel change are manual), so v5 stays quiet for automatic checks while v4 shows every event. Before downloading, `updateInstallGuard.js` prompts in main when a file has unsaved edits (both UIs). Under `NODE_ENV=testing`, `autoUpdaterService` returns `fakeAutoUpdater.js`, which never hits the network.
- e2e picks the UI by seeding `general.uiVersion` (`tests/e2e/util/Electron.js`), and clears `MFE_UI`/`MFE_RENDERER_URL`.
- The React renderer calls the same preload objects as v4, `window.franchiseAPI` and `window.electronAPI`, and gets the same response shapes (`src/shared/types/franchise.ts`). `src/renderer/src/preload.d.ts` declares only the methods React uses, so add a declaration when React starts calling a new one. The only React-specific channels are `files:get-saves` and `files:open-folder` (`electronAPI.files`, `main/handlers/filesHandler.js`).
- Handsontable: React uses `handsontable@16` + `@handsontable/react-wrapper`. v4 needs 11.1.0, installed under the alias `handsontable-v11` (`require("handsontable-v11")`). Don't collapse them.
- Monaco is bundled locally (`utils/monacoLoader.ts`, editor core + worker only), and the CSP allows `worker-src blob:`.
- `frtk` (expression tables) isn't published. Its types the renderer needs are copied into `src/shared/types/frtk.ts`.
- Renderer-only packages (react, handsontable 16, monaco, …) are devDependencies, because Vite bundles them and electron-builder would otherwise pack them. Installers ship both UIs: `build.files` includes `out/renderer/**/*`, and `build:app` runs `build:react`.
- Vitest uses non-scoped CSS-module class names, so snapshots don't depend on file paths.
- **Every React feature ships with tests.** A change that adds or changes user-visible React behaviour must add a spec in `tests/e2e/scripts/react/`, or extend one, so the flow runs through the real main process: the happy path, plus any persisted result (the saved file, `pins.json`, preferences). The harness (from `.claude/plans/react-conversion/02-react-e2e.md`):
    - Playwright has two projects: `v4` (everything outside `react/`) and `react` (`tests/e2e/scripts/react/**`). React specs launch with `electron.launchWithDefaultOptions({ ui: "react" })`, which loads the built `out/renderer`, so run `npm run build:react` after changing `src/`.
    - Page models are in `tests/e2e/models/react/`; `models/App.js` is shared. Native dialogs are stubbed in main with `util/dialogStubs.js` (no `TestUtility` in React). The fake updater is driven with `util/updaterStubs.js` (`setNextUpdate`, `setDownloadError`, `holdDownload`, `updaterCounts`); pass `env: { MFE_UPDATE_CHECK_DELAY_MS: "0" }` to `launchWithDefaultOptions` to run the startup check right away.
    - Wait with `locator.waitFor()` or `util/poll.js`, not Playwright's `expect(locator)`: `expect` comes from `@playwright/test` 1.25, which can't drive locators of the `playwright` 1.59 Electron instance.
  - Branching logic goes in vitest next to the code, with `window.franchiseAPI` / `electronAPI` mocked: pure utils, hooks, and components with several states.
  - Each step plan lists the specs it adds or extends in its Verification section.
  - When a feature reaches v4 parity, port the matching v4 spec and leave the v4 spec unchanged.
  - Don't select on CSS-module class names in e2e (they are hashed in the build). Use one of these instead:
    - Roles or text.
    - A `data-*` attribute named after the data it carries (`data-name`, `data-table-id`, `data-action`).
    - `data-testid`, when there is nothing natural to expose.

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
