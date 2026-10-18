# Startup performance: findings and tiers

Static analysis of the app init flow (main process + renderer up to the welcome screen),
done 2026-10-18. Baselines were captured 2026-10-18 (see "Baseline" section). See `startup-baseline-plan.md` for the
baseline plan. Work each tier independently.

## Startup sequence (as of commit 9987119)

**Main:** top-level requires (`main.js:1-45`: chokidar, electron-updater, FranchiseFileManager →
madden-franchise, externalDataHandler → xlsx, scheduleHandler → moment + madden-franchise,
ipcLogger → electron-log) → handler registration → `app.on("ready", createWindow)` (`main.js:474`)
→ `createWindow` (`main.js:350`): menu → main window (shown immediately) + `loadFile` → worker
window → `preferencesHandler.initialize()` (sync read + write) → updater config → hidden schema
window → hidden settings window. On main `did-finish-load`: update check and `schema-quick-scan`.

**Renderer:** `index.html` head CSS (incl. 2 remote Google Fonts) → `selectr.js` → `bundle.js`
→ `index.js`: `preferencesService.load()` (not awaited) → `setTimeout(50)` →
`require(navigationService)` (loads every editor + Handsontable + jsoneditor, module-scope init)
→ `onHomeClicked()` → `loadPage("welcome.html")` (IPC `fs.readFile`, innerHTML) →
`welcomeService.start` (serial IPC: recentFiles.initialize → getRecentFiles; getVersion).

## Baseline (2026-10-18, commit 9987119)

10 measured runs + 1 warmup each, via `scripts/perf-startup.js`; results in
`test/perf-results/20261018-*` (gitignored). **Primary comparison numbers are the real profile**
(`--profile real`), because the temp profile has a cold HTTP cache, which makes Google Fonts block
the page (~280ms per request) and hides bundle load time. Compare every fix against the same flags.

Medians (ms):

| Metric | real-prof (primary) | base-temp | packaged (temp) | real+updates+packaged |
|---|---|---|---|---|
| Spawn → createWindow end | 683 | 687 | 626 | 601 |
| Main requires total (M2) | 318 | 315 | 253 | 242 |
| FCP − main window created (M8) | 589 | 721 | 735 | 621 |
| Welcome interactive − spawn (M12) | 1108 | 1265 | 1196 | 1070 |
| Recent files rendered − spawn (M12) | 1121 | 1273 | 1200 | 1099 |
| Main event-loop delay max (M5) | 177 | 164 | 188 | 187 |
| Google Fonts sum (M11) | 21 | 583 | 602 | 23 |
| Editors load (M10) | 119 | 120 | 126 | 148 |
| Bundle tag → bundle start (M9) | 138 | 8 | 7 | 154 |

Real-profile timeline (median ms from spawn):

```
   0 → 161   Electron boot
 161 → 480   main.js requires (319ms)
 480 → 511   → ready
 511 → 686   createWindow, sync on main (main window created at 578)
 578 → 801   main renderer: navigation commit + preload + head CSS
 801 → 947   selectr.js + bundle.js load/compile/eval (~146ms)
 947 → 1001  50ms setTimeout (#8)
1001 → 1121  require(navigationService), one ~120ms long task (#2)
1121 → 1126  welcome visible, recent files rendered
```

Findings per item:

- #4: requires ≈315ms, nearly all of module-start → ready. electron-updater 139ms (fs-extra 43,
  semver 31, js-yaml 18), xlsx 92 (via externalDataHandler), chokidar 31, electron-log 23 (via
  ipcLogger). madden-franchise only ~8ms — not a library-side problem. Lazy-loading
  electron-updater + xlsx + chokidar ≈ 250ms.
- #1: createWindow 160–180ms sync on main and matches the event-loop max. Worker 38 + schema 17 +
  settings 25 ≈ 80ms of it. Their renderers finish loading at ~800–830ms, during the main window's
  critical path; trace shows ~100ms `LocalWindowProxy::Initialize` (context + preload) + ~60ms
  navigation commit per renderer. New: the hidden settings window calls `setAllSettingsAsShown()`
  (`renderer/js/settingsManager.js:99`) on every launch → `preferences:set` ≈47ms of sync per-key
  writes on main (`main/services/preferencesStore.js` `value()` saves per key). Ties into #9.
- #2 + #8: ~170ms of pure delay before welcome (120 editor load + 50 timer).
- #3: production `bundle.js` is 6.2MB (not 15MB; that was a dev build). ~146ms load/eval in real
  profile.
- #5: cold cache: ~280ms per fonts CSS request, blocks scripts; ≈+140ms to welcome vs real profile
  and the source of temp-profile p90 outliers (1551, 1610ms). Also delays schema/settings
  did-finish-load (~640/436 vs ~160/137ms). Warm cache: ~20ms. Offline baseline not yet taken.
- #7: prefs always loaded at the check, margin 120–200ms ≈ the #2+#8 delay, so removing those will
  likely expose the race.
- #11: update check fires at main did-finish-load; no measurable effect on welcome (updates-on 1225
  vs 1265, noise). Low priority.
- #9: prefs init 3.5ms; negligible apart from the settings-window write above.
- #10: welcome IPC + render ~5ms; negligible.
- Packaged: main side ~60–70ms faster (requires 315→253 via asar, M1 164→144); createWindow ~20ms
  slower; renderer unchanged.

Measurement caveats:

- `--updates` only affects temp profiles; the real profile already has updates on, so real-prof ==
  real-profile-with-updates.
- M9 is not pure parse+eval: with a cold cache the fonts wait delays the inline `renderer:bundle-tag`
  mark itself while bundle.js downloads, so it reads ~7ms. Use real-profile M9 or move the mark.
- M16 sizes in packaged runs are stat'd from the working tree, not the exe.
- Temp-profile p90s are network-driven until fonts are self-hosted.
- GPU process CPU ~640ms real vs ~400ms temp, unexplained (possibly saved window size). Minor.

## Results (implementation, see `startup-perf-implementation.md`)

Medians (ms), 10 measured runs. `perf-startup.js` now drops runs where the main window was hidden
(`renderer:page-hidden` mark). A hidden or occluded window (screen off or locked, covered) throttles
timers to ~1s and skips paints, which added ~900ms to welcome in some runs. Keep the screen on and
unobstructed while measuring. "n" counts runs actually used.

| Phase | Profile | n | M2 requires | M8 FCP−win | M10 editors | M12 welcome−spawn | M5 loop max |
|---|---|---|---|---|---|---|---|
| baseline | real | 10 | 318 | 589 | 119 | 1108 | 177 |
| baseline | temp | 10 | 315 | 721 | 120 | 1265 | 164 |
| 1 fonts | real | 10 | 307 | 569 | 111 | 1075 | 172 |
| 1 fonts | temp | 4 | 308 | 557 | 111 | 1071 | 174 |
| 2 lazy requires | real | 10 | 63 | 575 | 123 | 840 | 169 |
| 2 lazy requires | temp | 10 | 62 | 563 | 113 | 834 | 174 |
| 3 lazy windows | real | 10 | 63 | 537 | 159 | 808 | 202 |
| 3 lazy windows | temp | 10 | 62 | 497 | 113 | 767 | 101 |
| 4 lazy editors + minify | real | 10 | 63 | 309 | 3 | 580 | 206 |
| 4 lazy editors + minify | temp | 10 | 62 | 327 | 3 | 580 | 102 |

Phase 4: bundle.js 6.2MB → 3.6MB (esbuild minify), no long tasks before welcome, prefs always
loaded at the update-prompt check. M9 (bundle load) is still ~113ms, above the 80ms threshold
for the bundle split (4c follow-up).

Phase 3: createWindow 155 → 90ms; no prefs write on a normal launch (file mtime unchanged).
Real profile has update checks on, so the electron-updater require (~140ms, now lazy) lands in
main did-finish-load, overlapping the renderer's editor load (M10 159, M5 202). Phase 5's
deferred update check (#11) removes that.

Phase 1 new temp baseline: temp ≈ real now (network noise gone). Later phases compare against the phase-1 rows.

## Tier 1 — biggest likely wins

1. **4 BrowserWindows at startup** (`main.js:355, 421, 470, 471`). Schema and settings windows
   are hidden but fully loaded; each is a renderer process + bundle + preload competing with the
   main window and queuing IPC on the main thread. Settings already has a lazy path
   (`sendSettingsWindowEvent` creates it if missing). Schema is only needed at startup for
   `schema-quick-scan` (pref-gated). Worker could be created after main `did-finish-load`.
2. **Every editor loaded before the welcome screen** (`renderer/js/services/navigationService.js:1-21`).
   Schedule, schema viewer, ability editor and table editor (Handsontable, vanilla-jsoneditor UMD
   ~1.3MB, moment) are required and `new TableEditorWrapper()` runs in one long task before
   `onHomeClicked()`. Fix: lazy-require per nav item, or split bundles. Libraries: Handsontable,
   jsoneditor, moment.
3. **Bundle size / build** (`scripts/build-renderer.js`). No minification, single monolithic main
   bundle. The 15.3MB `bundle.js` on disk is a dev build (inline source map); measure a prod build
   first. Pairs with #2.
4. **Heavy main-process requires at module load** (`main.js:2, 11`, `main/services/FranchiseFileManager.js`,
   `main/handlers/externalDataHandler.js:1` xlsx, `main/handlers/scheduleHandler.js` moment +
   madden-franchise). All sync before `ready`. xlsx, chokidar, moment are lazy-load candidates;
   madden-franchise load cost is a possible library-side issue.

## Tier 2 — perceived speed and correctness

5. **Render-blocking Google Fonts** (`renderer/index.html:9-10`). Two cross-origin CSS requests in
   `<head>`; slow/offline network delays first paint. Self-host Roboto / Roboto Mono woff2 with
   `font-display: swap`.
6. **Main window has no `show:false` / `ready-to-show` / `backgroundColor`** (`main.js:355`).
   Blank/white window until first paint.
7. **Preferences race masked by the 50ms delay** (`navigationService.js:50` → `:805`).
   `conditionallyShowCheckForUpdatesNotification()` reads the prefs cache filled by an un-awaited
   IPC (`renderer/js/index.js:4`). If null, the "check for updates?" prompt shows wrongly.
   Fixing #2 or #8 will likely expose this — await prefs first. Main side has a similar ordering
   issue: `preferencesHandler.initialize()` runs after the main window starts loading (`main.js:449`).
8. **Arbitrary 50ms `setTimeout`** (`renderer/js/index.js:8`). Pure latency once #7 is fixed.

## Tier 3 — smaller / dev-only

9. **Prefs file rewritten every launch** (`main/services/preferencesStore.js` constructor → `save()`,
   sync read + write + rename). `preferences:set` saves once per key.
10. **Serial welcome IPC** (`renderer/js/services/welcomeService.js`): recentFiles.initialize →
    getRecentFiles, getVersion separate. Welcome HTML is fetched over IPC (`navigationService.js:422`)
    instead of inlined/bundled.
11. **Update check fires during the renderer's startup IPC burst** (`main.js:409`). Defer a few seconds.
12. **Sync `fs:*` IPC handlers** (`main.js` ~700-780, `main/handlers/recentFilesHandler.js`). Small
    at startup; `fs:read-file-base64` / `fs:import-table` on big files freeze all windows.
13. **Minor:** Selectr loaded twice (global `<script>` + bundle); Handsontable CSS render-blocking on
    welcome; `renderer/img/M25.PNG` 124KB shown at 36px; blur/saturate filters on ~9 inactive
    icons; dev-only full-payload IPC logging in preload and `main/utils/ipcLogger.js`.

## Dependencies between items

- #7 must be fixed before or with #2 and #8 (faster startup exposes the race).
- #2 and #3 are one piece of work (lazy loading + bundle splitting/minification).
- #1 affects how much #4, #9, #11 and #12 matter (fewer windows = less contention on main).
- #6 hides whatever remains of #2/#3/#5 from the user; measure before applying it, since it changes
  what "visible" means.

## Suggested order

1. #5 self-host fonts — cheap, removes network noise so base-temp becomes stable. Re-baseline after.
2. #4 lazy-load electron-updater, xlsx, chokidar (~250ms main side).
3. #1 defer hidden windows (worker after main did-finish-load, schema/settings lazy) and stop the
   settings window's every-launch `setAllSettingsAsShown` write (with #9).
4. #7 (await prefs), then #2/#8 and #3 together (~170ms + bundle cost).
5. #6, #10, #11, #13 last; measure #6 before applying since it changes what "visible" means.
