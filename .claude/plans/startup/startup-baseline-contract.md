# Run JSON contract (startupProfiler → perf-startup harness)

Written by `main/services/startupProfiler.js` `finish()` to `<MFE_PERF_OUT>/run-<n>.json`
(`<n>` = `MFE_PERF_RUN` env var if set, else `Date.now()`). All `t` / timestamps are **epoch ms**
(`performance.timeOrigin + performance.now()`), floats allowed.

```jsonc
{
  "version": 1,
  "timedOut": false,
  "flags": { "nohook": false, "trace": false, "autoquit": true },
  "env": { "electron": "x", "node": "x", "chrome": "x", "platform": "win32", "packaged": false },
  "marks": [
    // main marks: process "main"; renderer marks: process "renderer:<windowName>" (e.g. "renderer:main")
    { "name": "main:module-start", "t": 1760000000000.1, "process": "main", "detail": null }
  ],
  "requires": {
    "totalMs": 812.3,          // sum of inclusive time of top-level requires issued by main.js
    "entries": [               // sorted by ms desc
      // kind "main": request issued by main.js or a file under main/ (inclusive ms)
      // kind "package": first entry into a node_modules package (name = package name), inclusive ms
      { "kind": "package", "name": "madden-franchise", "parent": "main/services/FranchiseFileManager.js", "ms": 300.1 }
    ]
  },
  "eventLoop": { "maxMs": 120.5, "p99Ms": 40.1, "meanMs": 11.2 },   // null if monitor not started
  "windows": {
    // keyed by trackWindow name: "main", "worker", "schema", "settings"
    "main": { "created": 1760000000500, "domReady": 1760000000900, "didFinishLoad": 1760000001000 }
  },
  "appMetrics": [ /* raw app.getAppMetrics() array */ ],
  "renderer": {
    "main": {
      "timeOrigin": 1760000000600,
      "paint": [ { "name": "first-paint", "t": 1760000001100 }, { "name": "first-contentful-paint", "t": 1760000001120 } ],
      "longtasks": [ { "t": 1760000001200, "duration": 450 } ],
      "resources": [ { "name": "https://fonts.googleapis.com/...", "t": 1760000000700, "duration": 120, "transferSize": 0 } ],
      "navigation": { /* PerformanceNavigationTiming.toJSON(), times relative to that renderer's timeOrigin */ },
      "prefsRace": { "prefsLoadedT": 1760000001000, "checkT": 1760000001300, "prefsLoadedAtCheck": true }
    }
  },
  "ipc": { "recentFiles:get": { "count": 1, "totalMs": 2.1, "maxMs": 2.1 } },
  "tracePath": null
}
```

## Mark names (all must be present on a normal welcome-path run)

Main: `main:module-start`, `main:requires-done`, `main:ready`, `main:create-window-start`,
`main:menu-done`, `main:main-window-created`, `main:worker-window-created`, `main:prefs-init-start`,
`main:prefs-init-end`, `main:schema-window-created`, `main:settings-window-created`,
`main:create-window-end`. Conditional: `main:update-check`, `main:schema-quick-scan-sent`.

Renderer (process `renderer:main`): `renderer:bundle-tag`, `renderer:bundle-start`,
`renderer:prefs-loaded`, `renderer:editors-load-start`, `renderer:editors-load-end`,
`renderer:welcome-html-requested`, `renderer:update-prompt-check` (detail `{prefsLoaded}`),
`renderer:welcome-visible`, `renderer:welcome-interactive`, `renderer:recent-files-rendered`.

Window marks are in `windows`, not `marks`.

## Harness-side metrics (computed by scripts/perf-startup.js)

Harness passes env `MFE_PERF_SPAWN_T=<epoch ms at spawn>` too; the profiler copies it into the
JSON as `"spawnT"`. All derived durations in ms:

- M1 `spawnToModuleStart` = main:module-start − spawnT
- M2 `requiresTotal` = requires.totalMs; top 10 entries
- M3 `moduleStartToReady`, `readyToCreateWindowStart`, `createWindowDuration`
- M4 per-step deltas inside createWindow (`menu`, `mainWindow`, `workerWindow`, `prefsInit`, `schemaWindow`, `settingsWindow`)
- M5 eventLoop.maxMs / p99Ms
- M6 per window: didFinishLoad − created
- M7 per process type: cpu.percentCPUUsage, memory.workingSetSize (KB)
- M8 FP / FCP − windows.main.created
- M9 renderer:bundle-start − renderer:bundle-tag
- M10 editors-load-end − editors-load-start
- M11 font resources duration (sum + max)
- M12 welcome-visible / welcome-interactive / recent-files-rendered − windows.main.created, and − spawnT
- M13 longtasks count, total duration, top 5
- M14 checkT − prefsLoadedT (margin), prefsLoadedAtCheck
- M15 ipc per channel (median across runs of count/total/max)
- M16 file sizes of renderer/js/bundle.js, schemaManager.bundle.js, settingsManager.bundle.js, worker.bundle.js, renderer/css/app-manifest.css
