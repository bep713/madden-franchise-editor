# Startup performance: implementation plan ("Suggested order")

Implements the "Suggested order" in `startup-performance.md`. Five phases. Each one is its own commit
and gets measured before the next one starts. Item numbers (#N) refer to that doc.

**Measurement protocol (every phase):** `npm run sass:build && npm run build:renderer`, then
`node scripts/perf-startup.js --profile real --runs 10 --label <phase>`. After phase 1, also run
the default temp profile (`--label <phase>-temp`). Compare medians against the 2026-10-18 baseline
table and add a row per phase under a new "Results" section in `startup-performance.md`.
Then run `npm run test:unit` and `npm run e2eTest`.

---

## Phase 1: self-host fonts (#5)

**Goal:** no network requests in `<head>`, so temp-profile numbers become stable.

- `package.json`: add devDeps `@fontsource/roboto` and `@fontsource/roboto-mono` (pinned).
- `scripts/build-renderer.js` `VENDOR_FILES`: copy the weight-400 `latin` and `latin-ext` woff2
  files of both fonts to `renderer/css/vendor/fonts/`. That folder is already gitignored and is
  packaged by `renderer/**/*`. Only 400, the one weight `css?family=Roboto` serves today; bold
  stays browser-synthesized, same as now.
- New `renderer/sass/_fonts.scss`, imported first in `app-manifest.scss`: `@font-face` for
  "Roboto" and "Roboto Mono" with `font-display: swap`, `unicode-range` per subset, and
  `url("vendor/fonts/…")` (relative to `renderer/css/app-manifest.css`).
- Remove the two `fonts.googleapis.com` links from `renderer/index.html`, `schema-manager.html`,
  `settings-manager.html` and `credits.html`. First check that the other three pages load
  `app-manifest.css`. If one doesn't, add a small `<link>` to a fonts-only css, or keep that
  page's link (credits is never opened at startup).
- **Verify:** perf M11 (fonts sum) ≈ 0 in both profiles. Temp-profile M12 should drop by about
  140ms, and p90 outliers should go away. Check the welcome/table editor visually for font
  changes. **Re-baseline** temp profile after this phase. Later phases compare against it.

## Phase 2: lazy main-process requires (#4)

**Goal:** about 250ms off main-side requires (electron-updater 139, xlsx 92, chokidar 31).

- **chokidar:** drop the top-level require in `main.js:8` and require it inside `watchFile()`
  (`main.js:1119`).
- **xlsx:** in `main/handlers/externalDataHandler.js`, replace the top-level `require("xlsx")`
  with a memoized `getXlsx()` used at the 4 call sites (lines ~73–97). The unit test
  `tests/unit/externalData.test.js` must still pass unchanged.
- **electron-updater:** new `main/services/autoUpdaterService.js` exporting
  `getAutoUpdater()`. On first call it requires `electron-updater`, sets
  `autoInstallOnAppQuit=false` and `autoDownload=false`, calls
  `applyUpdateChannel(autoUpdater, getUpdateChannel())`, and runs an `onCreate` hook once (used
  for `addAutoUpdaterListeners`). It also exports `isLoaded()`.
  - `main.js`: remove the `:17` require and the `:468-470` config lines. `addAutoUpdaterListeners()`
    becomes the `onCreate` hook, wired up before anything can call `getAutoUpdater()`.
    `runUpdateCheck()` calls `getAutoUpdater()`.
  - The `general.updateChannel` change callback (`main.js:472`) calls `applyUpdateChannel` only
    when `isLoaded()`. Otherwise the first `getAutoUpdater()` picks up the new channel. It
    keeps its `runUpdateCheck()` call.
  - `registerUpdateHandlers` (`main/handlers/updateHandler.js`): its `autoUpdater` param
    becomes a getter `getAutoUpdater`, called inside each handler. Update the one call site.
- **electron-log** (23ms via ipcLogger): out of scope. It's needed for dev logging and the win
  is small. Note it as a follow-up.
- **Verify:** M2 drops from ~318 to ~70ms. Update check still works (menu → Check for Update,
  and the `updateChannel` e2e spec).

## Phase 3: defer hidden windows and stop every-launch prefs writes (#1, #9)

**Goal:** main window is the only renderer at startup in the common case. createWindow sync time
drops from ~170 to ~90ms. No prefs file write on a normal launch.

Findings that change the original #1 note:
- The worker window does nothing: `workerService.start()` is a no-op, and nothing sends
  `read-schema`. `passOrDelayWorkerIpcEvent` (`main.js:1036`) is also buggy: it queues
  `"read-schema"` under `args`, but the flush reads `event.arg`.
- The every-launch prefs write is `initializeSettingsManager()` → `setMissingKeys` +
  `preferencesService.setAll()` (`renderer/js/settingsManager.js:152-157`), not
  `setAllSettingsAsShown` (which only runs at the end of a shown page flow). `preferences:set`
  then saves once per key.
- The schema window serves IPC at runtime: `is-currently-searching` (sent on every file open;
  the main renderer waits for the reply to init `schemaMismatchService`),
  `get-schema-info-response`, `load-schema-done` and `schema-quick-scan`.
  `show-schema-manager` (`main.js:656`) sends right after `createSchemaWindow()`, which only
  works today because the window is pre-loaded.

Changes:
- **Shared helper** in `main.js`: `sendWhenLoaded(win, loggedWc, channel, ...args)`. It sends
  now, or on `did-finish-load` while `isLoadingMainFrame()`. `sendSettingsWindowEvent` uses it,
  and so does every send to the schema window.
- **Worker (decided: delete):** remove the worker window and everything tied to it:
  `workerWindow`/`loggedWorker`/`workerReady`/`pendingWorkerEvents`, `passOrDelayWorkerIpcEvent`,
  `sendAllPendingWorkerEvents`, the `read-schema` / `read-schema-done` IPC relays (nothing sends
  them; also drop `passOrDelayMainIpcEvent` if it has no other caller), `renderer/worker.html`,
  `renderer/js/worker.js`, `renderer/js/services/workerService.js`, the worker entry in
  `scripts/build-renderer.js`, and `worker.bundle.js` from `perf-startup.js`'s size list.
  Grep for `worker` in main/, preload/, renderer/, tests/, scripts/ and CLAUDE.md (it lists
  the 4 bundles and the "worker" window) and update the references.
- **Schema window:** don't create it in `createWindow`.
  - `show-schema-manager`: `createSchemaWindow()` + `sendWhenLoaded(... "get-schema-info-response", arg)`.
  - `is-currently-searching`: if there's no `schemaWindow`, reply
    `loggedMain.send("currently-searching-response", false)` directly. No window means no search.
  - `get-schema-info-response` / `load-schema-done`: forward only if `schemaWindow` exists.
  - Quick scan: in main `did-finish-load`, after the `checkForSchemaUpdates` check, also check
    `gameVersions.madden24Directory` (mirroring the renderer check at `schemaManager.js:276`).
    Only if both pass: `createSchemaWindow(false)` + `sendWhenLoaded(... "schema-quick-scan", 24)`.
  - `close-file` (`main.js:538`) already guards with `if (schemaWindow)`.
- **Settings window:** in `createWindow`, create it (hidden, as now) only if
  `settingsPagesPending(prefs)` is true. That's a main-side port of `getPagesToShow`'s
  `checkPage`: any `settingsManager.<page>` key falsy. Do this after main `did-finish-load`, not
  in `createWindow`. The renderer already shows itself after 1s. Otherwise it is created on
  demand by `sendSettingsWindowEvent` (already lazy).
- **Missing-key fill moves to main (#9):** `preferencesHandler.initialize()` deep-fills missing
  keys from defaults the same way `setMissingKeys` does: recursive into plain objects, never
  overwriting existing values. It runs after the store's one-level merge. In
  `settingsManager.js`, `initializeSettingsManager` keeps `setMissingKeys` on its local copy but
  calls `setAll` only if something was actually filled (have `setMissingKeys` return a changed
  flag).
- **`PreferencesStore` (#9):**
  - Constructor saves only if the serialized result differs from the file text, or the file is
    missing or corrupt. Compare against the exact text `save()` would write, including the
    trailing-newline rule.
  - Add `setMany(entries)` (or `value(key, v, { save: false })` + explicit `save()`), so
    `preferences:set` (`preferencesHandler.js:97-103`) writes once per call, not once per key.
  - Existing unit tests in `tests/unit/preferences.test.js` must still pass. Add tests for:
    no write on an unchanged load (mtime or a spy on `fs.writeFileSync`), one write per
    `preferences:set`, and the deep fill of a missing nested `settingsManager` key.
- **Order inside `createWindow`:** move `preferencesHandler.initialize()` to the top (before the
  main window). It's 3.5ms, and the window-gating logic above needs prefs.
- **Tests and perf tooling:**
  - `tests/e2e/models/App.js` `getSettingsManager()`: poll for the window (like
    `getMainWindow`) instead of a single `find`. The window is now created on menu click.
  - Fix the stale comment in `getMainWindow` about several windows.
  - `scripts/perf-startup.js`: move `main:worker-window-created`, `main:schema-window-created`
    and `main:settings-window-created` out of `MANDATORY_MARKS`, and make the M4 per-window
    rows null-safe. `diff()` already returns null.
- **Edge cases to test by hand:** first launch with no prefs file (settings flow shows); a new
  `settingsManager` key added to the schema (flow shows, key filled); open a file → schema
  mismatch prompt still appears; Schema manager from the schema viewer ("change schema") opens
  and shows loaded/expected highlights; quick scan with the pref on and a directory set.
- **Verify:** M4 and M5 (event-loop max) drop. Real-profile M8 (FCP) should improve since
  nothing competes with the main renderer. The prefs file mtime doesn't change across a normal
  launch.

## Phase 4: prefs race, then lazy editors and bundle cost (#7, #2, #8, #3)

**Goal:** remove ~170ms of delay before the welcome screen, and cut bundle load/eval.

**4a: #7 (land first, same commit or before 4b).**
- `preferencesService`: `load()` stores its promise. Add `whenLoaded()`, which returns it (or
  starts `load()` if it hasn't started).
- `navigationService.conditionallyShowCheckForUpdatesNotification()` becomes async and awaits
  `whenLoaded()` before reading. Keep the `prefsLoaded` perf mark, taken after the await.
- `index.js`: no change to the load call itself.

**4b: #2 + #8, lazy editors.**
- `navigationService.js`: keep eager only what the welcome page and global listeners need:
  `Tab`, `TableEditorTab` (lightweight classes, check), `utilService`, `menuService`,
  `updateService`, `welcomeService`, `reloadFileService`, `savedSchemaService`,
  `schemaMismatchService`, `preferencesService`, `perfService` and `ftcModalService`. Drop the
  unused `Selectr` require (`:4`) after confirming it's unused there.
- Lazy, memoized getters: `getScheduleService()`, `getSchemaViewerService()`,
  `getAbilityEditorService()` and `getTableEditorWrapper()` (does `new TableEditorWrapper()`
  on first call). On first load, each getter also:
  - sets `service.navigationData` (split `attachServicesToNavigationData` into a per-service
    `attachNavigationData(service)`; welcome is attached eagerly);
  - wires that service's listeners currently in `setupEvents()`: schedule `open-table-editor`,
    schemaViewer `change-schema`, and tableEditor `table-changed` / `table-editor:new-tab`.
- Replace every direct reference (`:245-249, 300, 323-329, 375-392, 397-404, 656, 705, 741-746`)
  with the getter. Calls that only *reset* state on an unloaded editor (`:656`
  `initialTableToSelect = null`) must not force a load: guard with `if (loaded)`, or keep
  `initialTableToSelect` in navigationService and pass it on load.
- `TestUtility` (`:446`): pass the getter. In `TestUtility.js`, resolve `tableEditorService`
  lazily at use time.
- `index.js`: remove `setTimeout(…, 50)` and call `require(navigationService)` +
  `onHomeClicked()` directly. Keep the `editors-load-*` marks; they now measure the eager part
  only.
- Check that `abilityEditorService` is reachable at all (it's in `services`, but `navigation.json`
  may hide it). If it's hidden, lazy loading costs nothing.
- `welcomeService` still pulls in `moment` for one date format (`welcomeService.js:240`).
  Replace it with a small `Intl.DateTimeFormat`/manual `MM/DD/YYYY hh:mm A` formatter so moment
  leaves the startup path. Keep the output identical.

**4c: #3, bundle cost.**
- `scripts/build-renderer.js`: for non-watch builds, minify each bundle's output buffer in
  `writeBundle` with `esbuild.transform(code, { minify: true, keepNames: true })`. esbuild is a
  new pinned devDep; it's fast, so it adds seconds to the build, not minutes. `keepNames` guards
  against any `constructor.name`/function-name reliance. Watch/dev builds stay unminified.
- Measure. Only if real-profile M9 (bundle load) is still above ~80ms, split the editors into a
  second bundle. The main bundle marks the lazy modules `external`, and an `editors.bundle.js`
  `require`s/exposes them. Getters become async and inject a `<script>` once. That's a bigger
  change. Decide after measuring, as a follow-up plan, not in this one.
- **Verify:** M10 (editors load) under ~20ms; M12 should drop by about 170ms plus the minify
  gain. Update-prompt behavior: with `general.checkForUpdates` unset the prompt shows; when set,
  it doesn't (check with a seeded prefs file, cold). Full e2e suite, especially table editor,
  tabs, pins, schedule → table jump, import/export via TestUtility.

## Phase 5: polish (#6, #10, #11, #13)

- **#11:** defer `runUpdateCheck()` in main `did-finish-load` by `setTimeout(…, 3000)`. With
  phase 2, that also delays the electron-updater require until then.
- **#10:** `welcomeService.start`: run `recentFiles.initialize`→`getRecentFiles` and
  `getVersion` with `Promise.all`. Low value; skip inlining `welcome.html`.
- **#13:** drop the global `selectr.js` `<script>` in `index.html` if nothing uses
  `window.Selectr` (grep first). Load `handsontable.full.min.css` from the table-editor page or
  mark it non-blocking. Shrink `renderer/img/M25.PNG` only if it's actually on the welcome page.
  Leave the dev-only IPC logging as is.
- **#6 (measure first):** add `backgroundColor` matching the app background (cheap, no change to
  what "visible" means). Only then consider `show:false` + `ready-to-show`. Record how M12/FCP
  are interpreted after that, since the window appears later but fully painted.

---

## Implementation approach

- Phases are sequential, because each needs its measurement, and phases 2 and 3 both edit
  `main.js` heavily. One commit per phase.
- Phases 1, 2 and 5 are small: implement directly. Phase 3 (main.js, preferences store and
  tests) and phase 4 (renderer) are medium: one sonnet subagent each, given this file and the
  phase number. I review the diff and run the measurements myself.
- Not in scope: electron-log lazy load, the bundle split (4c follow-up), deleting the worker
  window, and the GPU-process CPU question.
