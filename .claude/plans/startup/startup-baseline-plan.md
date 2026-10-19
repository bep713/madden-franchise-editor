# Plan: startup performance baseline

Status: **draft, awaiting approval**. Findings and tiers: `startup-performance.md`.

## Goal

Get repeatable numbers for every Tier 1 item (#1–#4) and for the items that depend on them
(#5, #6, #7, #8 from Tier 2; #9, #10, #11 from Tier 3), so each tier can be fixed independently
and checked against the same metrics. The instrumentation stays in the codebase behind an env
flag and costs nothing when the flag is off. **It must not change startup behavior when off.**

Out of scope: fixing anything, opening a franchise file, and #12/#13 (not on the welcome path,
or negligible).

## Approach

1. **Marks, not ad-hoc logs.** Every checkpoint is a named mark with an absolute timestamp
   (`performance.timeOrigin + performance.now()`, epoch ms) so main and renderer marks line up on
   one timeline. Mark names are semantic (`renderer:editors-loaded`, not
   `navigationService-required`) so they keep the same meaning after Tier 1 makes things lazy.
2. **Gated by `MFE_PERF=1`.** Main reads it from `process.env`. The preload exposes it to the
   renderer as `window.electronAPI.perf.enabled`. When off, every mark call is a no-op and no
   observers, hooks or handlers are installed.
3. **One JSON per launch.** The renderer sends its marks to main; main merges them with its own and
   with process metrics, writes `<MFE_PERF_OUT>/run-<n>.json`, and quits if `MFE_PERF_AUTOQUIT=1`.
4. **A harness runs N launches and summarizes them** (median / p90 / min per metric).
5. **On-demand attribution trace.** `MFE_PERF_TRACE=1` adds an Electron `contentTracing` capture
   of all processes during startup, which you open in Perfetto / chrome://tracing to see *which*
   modules and functions cost the time. It is not collected on every run because tracing adds
   overhead.

## Metrics (what each one baselines)

| ID | Metric | How | Items |
|----|--------|-----|-------|
| M1 | Spawn → main module start | harness spawn time vs first mark in `main.js` | context (Electron boot, not ours) |
| M2 | Main top-level require time, total + per module | `Module._load` hook (below) | #4 |
| M3 | Module start → `ready` → `createWindow` start/end | marks | #4, #1 |
| M4 | Time spent creating each window + `preferencesHandler.initialize()` | marks around each step in `createWindow` | #1, #9 |
| M5 | Main-thread event-loop delay (max, p99) from module start to finish | `perf_hooks.monitorEventLoopDelay` | #1, #4, #9, #11 |
| M6 | `did-finish-load` time for each of the 4 windows | `webContents` events | #1 |
| M7 | Per-process CPU and memory at finish | `app.getAppMetrics()` | #1 |
| M8 | Main window first-paint / first-contentful-paint, relative to window creation | renderer `PerformanceObserver("paint")` | #6, #5, #3 |
| M9 | Bundle parse+eval: inline mark before `<script src=bundle.js>` → first line of `index.js` | marks | #3 |
| M10 | Editor load: `require(navigationService)` start → end | marks in `index.js` | #2 |
| M11 | Google Fonts request durations | Resource Timing entries for `fonts.googleapis.com` / `fonts.gstatic.com` | #5 |
| M12 | Welcome visible (HTML injected), interactive (`welcomeService.start` listeners attached), recent files rendered | marks | #2, #8, #10 |
| M13 | Long tasks in main window (count, total, top 5) | `PerformanceObserver("longtask")` | #2, #3 |
| M14 | Prefs race: `renderer:prefs-loaded` time vs `renderer:update-prompt-check` time, and whether the cache was null at the check | marks + flag | #7 |
| M15 | IPC handler time per channel (count, total, max) during startup | timing in `createLoggedIpcMain` | #10, #11, #1 |
| M16 | Bundle sizes on disk (all 4 bundles + CSS) | harness `fs.stat` | #3 |

**Headline numbers** for comparing tiers: M1+M3 (time to window), M8 FCP, M12 welcome interactive,
M12 recent files rendered, M5 max event-loop delay.

**Finish condition:** the renderer reports `renderer:recent-files-rendered`, *and* all windows
created so far have fired `did-finish-load`, plus a fixed 3s settle period (this catches the
update check / schema quick scan when they're turned on). If that hasn't happened after 30s,
write what was collected with `timedOut: true`.

## Files to touch

New:
- `main/services/startupProfiler.js`. Main-side collector. It may require only `perf_hooks`,
  `fs`, `path` and `module`, so its own cost is negligible. Exports:
  - `enabled: boolean`
  - `mark(name, detail?)`
  - `installRequireHook()`. Wraps `Module._load`, records inclusive time per request issued by
    `main.js` or by files under `main/`, and per first entry into each `node_modules` package
    (so `madden-franchise`, `xlsx` etc. are attributed even when pulled in transitively).
  - `startEventLoopMonitor()`
  - `recordIpc(channel, ms)`
  - `addRendererMarks(windowName, payload)`
  - `trackWindow(name, browserWindow)`. Marks `created`, `dom-ready` and `did-finish-load`.
  - `maybeFinish()` / `finish()`. Gathers `app.getAppMetrics()`, writes the JSON, optionally
    stops tracing and quits.
- `renderer/js/services/perfService.js`. A thin renderer wrapper: `mark(name)`, `report()`.
  `report()` gathers marks, paint/longtask/resource/navigation entries and sends them over IPC.
  It's a no-op when `!window.electronAPI.perf?.enabled`.
- `scripts/perf-startup.js`. The harness (see below).

Edited (each edit is a single `mark` line or a guarded block):
- `main.js`
  - The very first lines: `const startupProfiler = require("./main/services/startupProfiler");`
    then, if `enabled`, `installRequireHook()`, `startEventLoopMonitor()`, `mark("main:module-start")`.
    These must come before the other requires or M2 misses them.
  - `mark("main:requires-done")` after the require block.
  - In `createWindow`: marks at start, after the menu, after each `new BrowserWindow`, around
    `preferencesHandler.initialize()`, and at the end. Call `trackWindow()` for main and worker.
  - `createSchemaWindow` / `createSettingsWindow`: `trackWindow()` after construction, so
    they're still tracked once Tier 1 makes them lazy.
  - `app.on("ready")`: one extra listener that marks `main:ready`. Leave `createWindow` wiring
    untouched.
  - The `perf:report` handler, registered only when enabled. It belongs in `addIpcListeners`
    alongside the other `app:*` handlers.
  - `runUpdateCheck` and the `schema-quick-scan` send: one mark each.
  - If `MFE_PERF_TRACE=1`, start `contentTracing` (categories: `devtools.timeline`, `v8`,
    `v8.execute`, `disabled-by-default-v8.cpu_profiler`, `blink`, `loading`, `toplevel`) in
    `ready`, before `createWindow`. Note: tracing can't start before `ready`, so main-process
    requires are covered by M2's hook only.
- `main/utils/ipcLogger.js`. In `handle`, wrap `handler` timing with `startupProfiler.recordIpc`
  when enabled. Keep the existing `isDev` logging unchanged.
- `preload/franchisePreload.js`. Add `perf: { enabled, report(payload) }` to `electronAPI`. It
  invokes `perf:report` and tags which window it comes from via `location.pathname` on the main
  side (`event.sender` → window lookup). `enabled = process.env.MFE_PERF === "1"`.
- `renderer/index.html`. Add an inline `<script>performance.mark("renderer:bundle-tag")</script>`
  right before `selectr.js`. It always runs; it's one native call with no IPC. (There's no CSP
  meta, so inline is allowed.)
- `renderer/js/index.js`
  - `mark("renderer:bundle-start")` on line 1, which gives M9.
  - Marks when `preferencesService.load()` resolves (`renderer:prefs-loaded`), and before and
    after the `navigationService` require (`renderer:editors-load-start` / `-end`).
  - **Keep the 50ms `setTimeout` and the un-awaited prefs load exactly as they are**, so this is a
    baseline.
- `renderer/js/services/navigationService.js`
  - `mark("renderer:update-prompt-check", { prefsLoaded })` inside
    `conditionallyShowCheckForUpdatesNotification` (M14).
  - In `onHomeClicked`: `renderer:welcome-html-requested`, `renderer:welcome-visible` (after
    `loadPage` resolves).
- `renderer/js/services/welcomeService.js`
  - `renderer:welcome-interactive` at the end of `start`.
  - `renderer:recent-files-rendered` after the list DOM is built, then `perfService.report()`.
    Only the first report per launch counts; later calls are ignored.
- `package.json`. Add a script: `"perf:startup": "node scripts/perf-startup.js"`.
- `.gitignore`. Add `test/perf-results/`.

Worker, schema and settings bundles don't get renderer marks. Their `did-finish-load` from main
(M6) plus CPU and memory (M7) are enough to baseline #1.

## Harness: `scripts/perf-startup.js`

- Options: `--runs N` (default 10), `--warmup 1`, `--profile temp|real` (default `temp`),
  `--updates on|off` (default off), `--trace` (one traced run, no stats), `--label <name>`,
  `--exe <path>` (packaged build instead of `electron .`).
- **It doesn't build anything.** It refuses to run if `renderer/js/bundle.js` contains
  `sourceMappingURL=data:`, because that means a dev bundle, which would invalidate M9/M16. Tell the
  user to run `npm run sass:build && npm run build:renderer`.
- `temp` profile: a new `--user-data-dir` per run, seeded the same way as the e2e tests. Reuse
  `buildTestPreferences` by exporting it from `tests/e2e/util/Electron.js`; that's a tiny,
  behavior-neutral change. The profile is seeded with a `recentFiles.json` of 10 entries pointing
  at `tests/data/m22` fixtures, so the recent-files render path does real work. `--updates on`
  flips `checkForUpdates` / `checkForSchemaUpdates` on, which measures #11 and the schema scan.
- `real` profile: no `--user-data-dir`; it uses the user's actual prefs, schemas and recent files.
  This is closer to real life but not reproducible across machines.
- Spawns `electron main.js` (from `require("electron")`) with
  `NODE_ENV=production MFE_PERF=1 MFE_PERF_AUTOQUIT=1 MFE_PERF_OUT=<dir>`, records the spawn time,
  and waits for the process to exit. Runs are sequential.
- Output goes to `test/perf-results/<YYYYMMDD-HHmm>-<label>-<git short sha>/` and contains the
  per-run JSONs, `summary.json` and `summary.md`. `summary.md` is a table of median / p90 / min per
  metric, the top 10 main requires, the top 5 long tasks, and IPC per channel. The first measured
  run is also listed separately as "cold-ish".

## Edge cases / risks

- **Observer effect.** When enabled, the require hook and the event-loop monitor add a little
  overhead. Compare tiers only against baselines taken with the same flags. The headline numbers
  can be sanity-checked with one `MFE_PERF=1` run where `MFE_PERF_NOHOOK=1` skips the require hook.
- **`timeOrigin` skew** between processes is sub-millisecond to a few ms. That's fine at this
  granularity.
- **Disabled by default.** Nothing new runs when `MFE_PERF` is unset. The e2e and unit tests
  must still pass unchanged.
- **The prefs race (#7) can't be seen** if prefs always load before the check. That's still a
  useful finding: record `prefsLoaded` and the time margin, not just pass or fail.
- **The Google Fonts number depends on the network.** Run once offline (Wi-Fi off) as a separate
  labeled baseline to show the worst case for #5.
- **Windows Defender / file cache.** The first run after a build or reboot is slower. The warm-up
  run is discarded, and "cold-ish" is reported separately rather than mixed in.
- **Packaged vs unpacked.** asar reads and the production `NODE_ENV` differ from `electron .`. Take
  the main baseline unpacked (fast iteration). Also take one packaged baseline
  (`electron-builder --dir`, then `--exe`) for absolute numbers. Don't run `build:app`, because it
  publishes.
- `NODE_ENV=production` isn't `development`, so no devtools, electron-reload or IPC debug
  logging. That's what we want.

## Verification of the instrumentation itself

1. `npm run test:unit` and `npm run e2eTest` pass (flag off, no behavior change).
2. `npm run perf:startup -- --runs 3` produces 3 JSONs, each with every mark M1–M16 present and
   `timedOut: false`.
3. Sanity checks: the marks are in the expected order, and the M2 top modules include
   `madden-franchise` and `xlsx`.
4. A `--trace` run produces a trace that opens in https://ui.perfetto.dev and shows main and renderer
   tracks.
5. Review the diff: every non-new-file change is a mark line, the guarded profiler block, or the
   `perf:report` handler. No logic changes.

## Baselines to capture (after the instrumentation is merged)

| Label | Command | Purpose |
|-------|---------|---------|
| `base-temp` | `--runs 10` | primary baseline, every tier compares against it |
| `base-temp-updates` | `--runs 10 --updates on` | #11 + schema quick scan cost |
| `base-offline` | `--runs 5`, network off | worst case for #5 |
| `base-real` | `--runs 10 --profile real` | sanity check against the real profile |
| `base-packaged` | `--runs 5 --exe dist/win-unpacked/...exe` | absolute numbers |
| `base-trace` | `--trace` | attribution for #2/#3/#4 |

Record the headline numbers from `base-temp` in `startup-performance.md` under a "Baseline"
section, so each tier's PR can quote before and after.

## Implementation size

Medium: ~3 new files, ~8 small edits. One Sonnet subagent with this plan file is enough, or I
can do it directly. After that, run the verification steps and review the diff against this plan.
