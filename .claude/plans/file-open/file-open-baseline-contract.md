# Run JSON contract (file-open profiling)

Extends `.claude/plans/startup/startup-baseline-contract.md`. Active only with `MFE_PERF=1` **and**
`MFE_PERF_OPEN=<absolute path to a copy of the franchise file>`. Same `run-<n>.json` layout; the
profiler writes it after the open completes (renderer `open:interactive` + report) instead of after
the welcome settle. Marks are epoch ms. Timeout is 60s in open mode.

## Flow
After `renderer:welcome-interactive` the welcome service calls `openFileFromPath(MFE_PERF_OPEN)`.
When `open:interactive` is marked the renderer sends the marks recorded since the startup report via
`perf:report-open`; main merges them (process `renderer:<window>`) and calls `finish()`.
With `MFE_PERF_OPEN_WARM=1` the renderer opens the same path a second time (warm open) and the
warm marks are the same names prefixed `warm:`... (see harness) — the report is sent after the second
`open:interactive`.

## Marks (renderer, process `renderer:main`)
`open:requested`, `open:loader-shown`, `open:meta-prepass-start`, `open:meta-prepass-end`,
`open:openfile-ipc-start`, `open:openfile-ipc-end`, `open:tabs-generated`, `open:file-loaded-sent`,
`open:editor-start` (detail `{editor}`), `open:editor-visible`, `open:interactive`, `open:loader-hidden`.
Editor-specific: `open:te-start`, `open:te-metadata`, `open:te-tablelist`, `open:te-selectr`,
`open:te-ready`; `open:schedule-start`, `open:schedule-end`; `open:schema-viewer-start`, `open:schema-viewer-end`.

## Marks (main)
`open:handler-prepass-start/end` (detail `{ms, tableCount, bytes}`), `open:parse-start`, `open:parse-ready`,
`open:prefs-applied`, `open:backup-start`, `open:backup-end`, `open:metadata-built`
(detail `{tableCount, bytes}`), `open:file-loaded-recv`, `open:watch-start`, `open:watch-end`.
Repeated builds of metadata (`franchise:get-metadata`) also emit `open:metadata-built`.

## Metrics (computed by scripts/perf-file-open.js)
- M-open-total = `open:interactive` − `open:requested`
- M-pre-pass = `open:meta-prepass-end` − `open:meta-prepass-start`
- M-lib-parse = `open:parse-ready` − `open:parse-start`
- M-app-overhead = M-open-total − M-lib-parse − user waits (ftc modal; not present for career files)
- M-editor-ready = `open:interactive` − `open:editor-start`
- IPC payload bytes: `detail.bytes` of `open:metadata-built`
- longtasks between `open:requested` and `open:interactive`; `ipc` per-channel table as in startup.
