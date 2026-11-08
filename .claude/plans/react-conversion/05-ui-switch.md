# 05: Switch between the v5 and legacy (v4) UI

Add a saved preference that picks the main window's UI, and a visible way to switch: on both Welcome pages, in Preferences, and in the app menu. Switching reloads only the main window's frontend. Main keeps the open file, its unsaved edits, the file watcher, the window title and the schema/settings windows. v5 becomes the default for everyone. v4 is "legacy": it stays in the app indefinitely and gets no new features. This plan only adds what v4 needs to take part in the switch (05b).

Decisions (from the user, 2026-11-08):
- v5 is the default for **all** users, including existing ones who upgrade (05d).
- **Parity gate.** No build with v5 in it ships (nightly or stable) until v5 is at complete v4 parity. 05a–05d stay on `v5-react-conversion` and reach `master` together, after every item in `plan.md`'s parity checklist is checked. So nobody has a stored `"v4"` before the default flips.
- Switching reloads at once. No confirm dialog.
- After a switch the user lands on Home, with the open file still open. The editor/table they were on is not restored.
- The escape hatch from a broken v5 (blank page, crash on load) is an app menu item that main keeps enabled. There's no automatic fallback on a renderer crash or failed load.
- No in-app notice for upgraders. The release notes say v5 is the default and how to switch back.
- v4 is kept **indefinitely**. It gets no features, but changes to main, preload or IPC must keep it working, and the `v4` Playwright project stays in CI. The preference never needs a migration. If v4 is ever removed, changing `resolveUi` to map `"v4"` to v5 is enough.
- `MFE_UI` / `MFE_RENDERER_URL` still override the preference for the session they're set in. A switch made during that session clears the override and follows the new preference.

Do the steps in order. Each step ends with green tests and can be committed by itself. The branch doesn't build nightlies, so no user sees an in-between state.

## Facts this relies on
- `main.js:387-393`: the UI is picked once, in `createWindow()`. `MFE_RENDERER_URL` → `loadURL`, `MFE_UI=react` → `loadFile("out/renderer/index.html")`, otherwise `loadFile("renderer/index.html")`. Both UIs use the same preload and the same `ipcMain` handlers, so reloading `mainWindow`'s webContents with the other page is enough. Nothing in main is per-UI.
- Main keeps everything a reload has to survive: `franchiseFileManager.activeFiles` (`{file, path}`), `currentFilePath`/`currentFileId` (`main.js:352-353`, set by the `file-loaded` message, `:535`), the chokidar watcher and the title. Edits are written to the `FranchiseFile` in main as they are made, so a reload loses no unsaved changes, even with autosave off.
- Both UIs call `franchiseAPI.openFile` first and send `file-loaded` afterwards (v4 `navigationService.js:~757/795`, React `Welcome.tsx:138/174`). Both close the previous file before opening the next, so `activeFiles` normally holds at most one entry. Between the two calls, the file is in `activeFiles` but `currentFileId` still holds the old id (or `""`), and the title, watcher and file menu items aren't set yet.
- `app:get-active-file-id` (`main.js:724`) returns the last key of `activeFiles`, not `currentFileId`.
- `preferencesHandler.onPreferenceChange(keyPath, cb)` (`main/handlers/preferencesHandler.js:14`) fires inside the `preferences:set` handler, before that handler replies and before `preferences:update` goes out (`:154-170`). `general.updateChannel` already uses it (`main.js:462`). `preferences:set` writes per key (`section.key`), so `{ general: { uiVersion } }` changes nothing else. The Preferences dialog (settings window, v4 code, shared by both UIs) builds its form from `data/preferencesSchema.json`, so a new `dropdown` field shows up there with no UI code.
- `fillMissingKeys` (`preferencesHandler.js:49`) fills keys missing from an existing `preferences.json` with the schema default, and never overwrites a stored value.
- React already restores the open file after a reload: `useActiveFranchiseFile` (`src/renderer/src/hooks/useActiveFranchiseFile.tsx:41`) calls `getActiveFileId`, then `getMetadata` + `getTableList`. It doesn't restore `path`, so "Open file location" and the common-file "Change parameters" action don't work after a reload.
- v4 does **not** restore. `renderer/js/index.js:19` calls `navigationService.onHomeClicked()` with an empty `currentlyOpenedFile`. Everything a loaded file needs is set inside the `welcomeService` `open-file` handler (`renderer/js/services/navigationService.js:~730-830`): the `currentlyOpenedFile` fields, the m22 defaults for a missing `gameYear`/`type.year`, `generateMainNavigationTabs()`, the `onFileSaving`/`onFileSaved` listeners and `is-currently-searching`. `welcomeService.start(file)` shows the file links when `file.type` is set. No main-window code listens to main's `file-loaded` echo.
- `did-finish-load` (`main.js:421-459`) runs on every load, a reload included. It starts the update check, the schema quick scan and the first-run settings window. The scan and the settings window already guard against a second run; the update check doesn't.
- Updater events go to the main window only as they happen (`main.js:1005-1042`: `checking-for-updates`, `update-ready`, `update-not-available`, `update-error`, `update-progress`, `update-downloaded`). v4 shows them in `renderer/js/services/updateService.js`. React handles none of them yet (a parity item). A reload drops whatever notification was showing.
- App menu: `createApplicationMenu()` runs after `preferencesHandler.initialize()` (`main.js:361-366`). The View menu (`:188`) holds reload, zoom and "Reveal in Explorer". React's `useMenuState` and v4's `menuService` only touch ids listed in `navigation.json`'s `menu.enable/disable`; ids outside it keep whatever main set. `enableFileMenuItems()` (`main.js:1056`) turns all file-dependent items back on. `mutateMenuIds(ids, key, value)` (`:1072`) can set `checked` as well as `enabled`.
- Scripts: `dev:electron` is `cross-env NODE_ENV=development electron .` (used by `npm run dev`), with no `MFE_UI`. `dev:react` sets `MFE_RENDERER_URL`; `start:react` sets `MFE_UI=react`. There's no plain `start` script.
- e2e: `tests/e2e/util/Electron.js` seeds `preferences.json` from the schema defaults (`buildTestPreferences`) and picks the UI with `MFE_UI` (`buildLaunchEnv`, `:42`). Playwright has a `v4` and a `react` project.
- Installers ship v4 only: `out/renderer/**` isn't in `package.json` `build.files`, and `build:app` doesn't run `build:react`. The CI composite action runs `build:react` before electron-builder in the same job, so release/nightly builds already have `out/renderer` on disk.

## Naming
- Preference: `general.uiVersion`, a `dropdown` with values `"v5"` and `"v4"`. Label "User interface". Options "New (v5)" and "Legacy (v4)". Help: "Legacy is the previous interface. It stays available but doesn't get new features. Switching reloads the window; the open file stays open and unsaved changes are kept."
- App menu: View → "Interface" submenu with two `type: "radio"` items, ids `UiVersionV5` ("New") and `UiVersionV4` ("Legacy"). Not listed in `navigation.json`, so neither UI enables or disables them.
- `MFE_UI` accepts `react` (as today; means v5) and `v4`. Anything else is ignored.

---

## 05a: Main picks the UI from the preference and switches live

### Changes
- `data/preferencesSchema.json`: add `general.uiVersion` (above). **`defaultValue: "v4"` in this step**; 05d flips it. Place it after `defaultEditor`.
- New `main/utils/uiSelection.js` (pure, no electron import, so it's unit-testable):
  - `envUiOverride(env)`: `"v5"` if `env.MFE_RENDERER_URL` is set or `env.MFE_UI === "react"`; `"v4"` if `env.MFE_UI === "v4"`; otherwise `null`.
  - `resolveUi({ override, preference })`: `override ?? (preference === "v4" ? "v4" : "v5")`. Unknown or missing values count as v5.
  - `uiTarget({ ui, rendererUrl, reactBuildExists, isPackaged })`: returns `{ ui, url }` or `{ ui, file }`. v5 → `{ url: rendererUrl }` if set; else `{ file: "out/renderer/index.html" }` if `reactBuildExists`; else fall back to `{ ui: "v4", file: "renderer/index.html", fallback: true }`. v4 → `{ file: "renderer/index.html" }`.
- `main.js`:
  - Replace the `if/else` at `:387-393` with `loadMainUi()`: computes the target from `uiSelection` (override from env, read once at startup into `let uiOverride`; preference from `preferencesInstance.value("general.uiVersion")`; `reactBuildExists` = `fs.existsSync(path.join(__dirname, reactHomePage))`, which works inside asar). Stores `currentUi = target.ui` and checks the matching menu radio item (`mutateMenuIds([id], "checked", true)`). On `fallback`: `console.warn` in dev; in a packaged build (`app.isPackaged`) `console.error`, since a missing `out/renderer` there means a broken installer.
  - App menu: add the View → "Interface" submenu (Naming). Each item's `click` calls `preferencesHandler.setPreferences({ general: { uiVersion: value } })`. Don't call `switchMainUi` directly; the preference callback does it, so the menu, the Welcome links and the Preferences dialog share one path.
- `main/handlers/preferencesHandler.js`: move the body of the `preferences:set` handler (`:122-176`) into an exported `setPreferences(preferences)`, which writes the values, applies them to `franchiseFileManager`, runs the change callbacks and sends `preferences:update` (so an open Preferences window shows the new value). The IPC handler calls it. Its behaviour must not change; `tests/unit` covers the store, so add a unit test that `setPreferences` runs a registered `onPreferenceChange` callback once, with `(after, before)`.
  - `preferencesHandler.onPreferenceChange("general.uiVersion", ...)`: set `uiOverride = null`, then `setImmediate(switchMainUi)` so `preferences:set` replies before the renderer goes away.
  - `switchMainUi()`: no-op without `mainWindow` or when the resolved UI equals `currentUi`. Otherwise:
    - if a file is open (`currentFilePath`), call `enableFileMenuItems()` (each UI narrows the menu again on its first page) and reset the title to `${baseWindowTitle} - ${currentFilePath}` (a `saving`→`saved` pair cut off by the reload would leave "Saving..." there);
    - `pendingSaves = []`;
    - `loadMainUi()`.
  - Update status: keep `lastUpdateEvent = { channel, data }` for the states a user acts on (`update-ready`, `update-progress`, `update-downloaded`, `update-error`); `checking-for-updates` and `update-not-available` clear it. New `ipcMain.handle("app:get-update-status")` returns it or `null`; preload `electronAPI.getUpdateStatus()`. v4 reads it in 05b; React's update UI (parity checklist) reads it on mount.
  - `did-finish-load`: run the update check only on the first load (`let mainUiLoadedOnce`). The scan and settings-window branches stay as they are; they already guard themselves.
- `package.json`: `dev:electron` → `cross-env NODE_ENV=development MFE_UI=v4 electron .`, so `npm run dev` keeps loading v4 once the default is v5 (instead of a stale `out/renderer`).
- `tests/e2e/util/Electron.js`: `buildLaunchEnv` always deletes `MFE_UI` and `MFE_RENDERER_URL`. The UI is picked by seeding `general.uiVersion`: `"v5"` for `ui: "react"`, `"v4"` otherwise (set in `launchWithDefaultOptions` before `options.preferences` is merged, so a test can still override it). Update the comment at `:38-41`.
- `CLAUDE.md`: the v5 section's "main.js loads the React UI when…" describes the preference, the env override, the menu and the live switch. The Commands block notes that `npm run dev` forces v4.

### Edge cases
- Switching while a save runs: the save finishes in main (`_runExclusive`). Its `franchise:saved` event can land on the old page and be lost; that's harmless.
- Switching while a file is opening (between `openFile` and `file-loaded`): handled by 05b/05c's restore through `getActiveFile().loaded`.
- Switching while a v4/React modal is open (FTC prompt, message box): native message boxes block the renderer and the menu, so the switch can't happen. In-page modals are dropped with the page.
- A broken v5 (blank page or a renderer crash): the user switches with View → Interface → Legacy. No automatic fallback.
- Dev without `out/renderer` and without the dev server: v5 falls back to v4 with a console warning. No dialog.
- `NODE_ENV=development` and `electron-reload`: a relaunch reads the preference again; an env override still wins.

### Verification
- New `tests/unit/uiSelection.test.js` (node:test): every `envUiOverride` combination, `resolveUi` with override/preference/unknown values, `uiTarget` for URL, built file and missing build.
- `npm run test:unit`, `npm run e2eTest` (all existing v4 and React specs still pass with the pref-based launch).
- Manual: `npm run dev:react`, open a file, View → Interface → Legacy: the main window reloads into v4, the title keeps the file path, and Preferences shows "Legacy (v4)". Set "New (v5)" in Preferences: it reloads into the dev server and the menu radio follows.
- 05c's spec covers this step end to end.

---

## 05b: v4 restores the open file, shows a pending update and gets a "new UI" link

The only v4 changes in this plan. v4 gets nothing beyond what it needs to take part in a switch.

### Changes
- New IPC `app:get-active-file` in `main.js` next to `app:get-active-file-id`. It returns `null` when `activeFiles` is empty. Otherwise it returns `{ fileId, path, loaded }`:
  - for `currentFileId` if that id is in `activeFiles`, else for the last entry;
  - `loaded` is `fileId === currentFileId`, so it is `false` when a switch cut an open off before `file-loaded`.

  Preload: `franchiseAPI.getActiveFile()`. 05c uses it too.
- `renderer/js/services/navigationService.js`:
  - Move the part of the `open-file` handler that runs after `openFile` succeeds into `adoptOpenedFile({ fileId, path, metadata }, { restored })`. It sets:
    - the `currentlyOpenedFile` fields;
    - the m22 defaults;
    - `generateMainNavigationTabs()`;
    - the `onFileSaving`/`onFileSaved` listeners;
    - `is-currently-searching`.

    With `restored: false` (the open path) it also sends `file-loaded` and opens `general.defaultEditor`, as today. With `restored: true` it opens no editor (the user stays on Home), and it sends `file-loaded` only when `loaded` is `false`. A normal open must behave exactly as before.
  - `navigationService.restoreOpenFile()`: calls `getActiveFile()`. If a file comes back, it calls `getMetadata(fileId)`, then `adoptOpenedFile(..., { restored: true, loaded })`. Errors are logged and leave an empty Home.
- `renderer/js/index.js`: `await navigationService.restoreOpenFile()` before `onHomeClicked()`, so Welcome starts with the file links showing.
- `renderer/js/services/updateService.js`: in `initialize()`, `await window.electronAPI.getUpdateStatus()` and, if it returns an event, run the matching handler (pull the `electronAPI.on` callbacks out into named functions so both paths call them).
- `renderer/welcome.html`: a link item `<li id="switch-ui" class="link-item" data-action="switch-ui">Switch to the new interface</li>` in the always-visible header list, below "Open a franchise file". `welcomeService.addListeners`: on click, `window.electronAPI.preferences.set({ general: { uiVersion: "v5" } })`.

### Verification
- `npm run build:renderer`, `npm run e2eTest` (the v4 open flow, tabs and default editor specs prove `adoptOpenedFile` didn't change a normal open).
- Manual:
  - Open a file in v4, then View → Interface → New, then back to Legacy. v4 comes back on Home with the file links, the table editor opens the file's tables, and an edit saves (the title shows "Saved").
  - With an update available (`dev-app-update.yml` or a stubbed `update-ready`), switch: v4 shows the update notification again.
- The round-trip spec is added in 05c, once both sides have a button.

---

## 05c: React restores the path and gets a "legacy UI" link

### Changes
- `src/renderer/src/preload.d.ts`: declare `franchiseAPI.getActiveFile(): Promise<{ fileId: string; path: string; loaded: boolean } | null>` and `electronAPI.getUpdateStatus()` (the latter for the parity item; declare it there if that lands later).
- `useActiveFranchiseFile`:
  - Use `getActiveFile()` instead of `getActiveFileId()`, and pass `path` to `buildOpenFranchiseFile`.
  - If `loaded` is `false`, send `file-loaded` (`{ path, type: metadata.type, fileId }`, as `Welcome.tsx` does).
  - Update `useActiveFranchiseFile.test.ts` for three cases: the path is restored; `loaded: false` sends `file-loaded`; `null` leaves no file.
  - Drop `getActiveFileId` from `preload.d.ts` if nothing else in `src/` uses it. The v4 schema manager keeps using the channel.
- `routes/Welcome/SideNav.tsx`:
  - New item `{ id: 'switchUi', text: 'Switch to legacy UI' }`, with an icon from `@assets/icons` (reuse one; don't add art) and `data-action='switch-ui'`. On click it calls `window.electronAPI.preferences.set({ general: { uiVersion: 'v4' } })`. Wire it through `Welcome.tsx` like `onSchemaManagementClick`.
  - Wire the existing `settings` item, which does nothing today, to open Preferences with `window.electronAPI.send('show-preferences-window')` (`main.js:663`).
- `Welcome.test.tsx`: the switch item calls `preferences.set` with `{ general: { uiVersion: 'v4' } }`; the settings item sends `show-preferences-window`.

### Verification
- New `tests/e2e/scripts/react/ui-switch.spec.js` (React project, `ui: "react"`). New model methods:
  - `react/WelcomePage.switchToLegacy()` and v4 `WelcomePage.switchToNew()`, both selecting `data-action="switch-ui"`;
  - `App.clickMenuItem(id)`, which uses `electronApp.evaluate` to `Menu.getApplicationMenu().getMenuItemById(id).click()`.

  The spec's tests:
  1. Open the M22 test career in React and switch to legacy. Wait for v4's `#open-different-file`. Open the table editor and check that a known table and value are there. Read `preferences.json` in the test's userData dir: `general.uiVersion === "v4"`.
  2. Edit a cell in v4 (autosave on) and switch to new. React's Welcome shows the open file's name and path (`GetStartedCard`), and the table editor shows the edited value. The edit is in the saved file.
  3. Switch through Preferences: use `tests/e2e/models/SettingsManager.js` (as `updateChannel.spec.js` does) to set "Legacy (v4)", and wait for v4's Welcome.
  4. Switch through the menu: `App.clickMenuItem("UiVersionV5")` from v4, and wait for React's Welcome. The `UiVersionV5` radio item is `checked`.
- Remembering the choice across launches is covered by the persisted `preferences.json` value plus 05a's unit test of `resolveUi`.
- `npm run typecheck`, `npm run lint`, `npm run test:react`, `npm run e2eTest`.

---

## 05d: v5 becomes the default and ships in the installer

**Precondition:** every item in `plan.md`'s "Parity checklist" is checked. 05d is the last commit before the branch goes to `master`.

### Changes
- `data/preferencesSchema.json`: set `general.uiVersion`'s `defaultValue` to `"v5"`. Users upgrading from a release before this one have no `uiVersion` key, so `fillMissingKeys` gives them v5.
- `package.json`:
  - `build.files`: add `"out/renderer/**/*"`.
  - `build:app`: run `npm run build:react` too.
  - Check that nothing renderer-only (react, handsontable 16, monaco) gets packed. They're devDependencies, so they shouldn't be. Compare the installer size with the last release and note it in the commit.
- `main.js`: the "Otherwise the v4 UI loads" comment at `:342-343` becomes "the `general.uiVersion` preference picks the UI; v5 is the default".
- `CLAUDE.md`:
  - Intro and v5 section: replace "v4 stays the default until the React UI reaches parity" and "`out/renderer` isn't in `build.files` yet" with: v5 is the default and v4 is legacy, kept indefinitely. v4 gets no features, but changes to main, preload or IPC must keep it working, and the `v4` e2e project stays.
  - "New work belongs on the IPC/preload side" still holds.
- `plan.md`: mark 05 done in the table.
- Release notes (draft release body): "The new interface (v5) is now the default. To go back, use View → Interface → Legacy, or Preferences → User interface. Your open file stays open."

### Verification
- `npm run build:app` locally, without publishing (`npx electron-builder -w --publish never`).
- List the asar contents and check that `out/renderer/index.html` is in it.
- Install it and check:
  - a fresh install opens v5;
  - an install over an existing profile whose `preferences.json` has no `uiVersion` opens v5;
  - switching to legacy and restarting opens v4;
  - View → Interface works from both UIs.
- `npm run e2eTest`. The harness seeds the preference per project, so the default flip doesn't change which UI a spec gets.
