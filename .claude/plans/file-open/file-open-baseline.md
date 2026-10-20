# File-open baseline (app overhead)

Captured 2026-10-18 on branch `master` at b0d667b plus the uncommitted instrumentation, dev run (`electron main.js`, bundles built with `npm run build:renderer`), temp profile, `autoSave` off, 10 measured runs + 1 warmup per cell, `--warm` (second open of the same file in the same session). Results: `test/perf-results/20261018-2129-baseline-b0d667b/` (all cells), c27 home and table-editor cells re-run in `...-c27home-...` and `...-c27te-...` because some runs were dropped (hidden window). The re-runs agree with the first pass within 10%.

Median ms. Definitions: `.claude/plans/file-open/file-open-baseline-contract.md`. M-app-overhead = total - lib-parse, so it **includes the pre-pass**, which is itself mostly library work (schema resolve + parse).

| file | editor | open | total | pre-pass | lib-parse | app-overhead | editor-ready |
|---|---|---|---|---|---|---|---|
| m22 | home | cold | 698 | 494 | 124 | 574 | 0.2 |
| m22 | home | warm | 694 | 502 | 116 | 577 | 0.2 |
| m22 | table editor | cold | 1108 | 504 | 125 | 983 | 401 |
| m22 | table editor | warm | 879 | 499 | 116 | 762 | 188 |
| m22 | schedule | cold | 1018 | 501 | 126 | 896 | 318 |
| m22 | schedule | warm | 850 | 578 | 110 | 742 | 84 |
| m22 | schema viewer | cold | 841 | 494 | 124 | 717 | 144 |
| m22 | schema viewer | warm | 806 | 498 | 115 | 687 | 112 |
| c27 | home | cold | 5463 | 3415 | 1947 | 3500 | 0.3 |
| c27 | home | warm | 6245 | 2414 | 3737 | 2492 | 0.1 |
| c27 | table editor | cold | 5867 | 3421 | 1955 | 3932 | 436 |
| c27 | table editor | warm | 6044 | 2078 | 3685 | 2379 | 226 |
| c27 | schedule | n/a (madden only in `navigation.json`) | | | | | |
| c27 | schema viewer | cold | 5716 | 3371 | 1931 | 3767 | 322 |
| c27 | schema viewer | warm | 5908 | 2106 | 3479 | 2443 | 259 |

Other medians: backup write 7 ms (m22) / 12 ms (c27); metadata builds per open 2 (home, schema viewer), 3 (table editor), 4 (schedule); metadata IPC total 0.50-1.0 MB (m22) and 0.64-0.96 MB (c27); renderer longtasks only in the table editor (2 cold, ~170-230 ms; 1 warm, ~90-120 ms).

## Hypotheses

- **H1 double parse: confirmed, the dominant cost.** The pre-pass (`getMetadataFromFilePath` -> `FranchiseFile.create`) takes 494 ms on m22 (71% of a home open) and 3.4 s on c27 (62%), against 124 ms / 1.95 s for the real parse. The pre-pass only needs `format`. Warm opens do not make it cheaper on m22 (~500 ms), so it is not a one-time schema cache cost. The pre-pass being 4x the actual parse on m22 suggests it pays for schema resolution on every call; that part belongs to the library pass.
- **H2 `_buildMetadata` 2-4x per open: confirmed in count, cost not isolated.** 0.5-1.0 MB of metadata crosses IPC per open. The time is inside the spans above; measure it separately (a mark pair around `JSON.stringify` already exists as the byte count) before optimising.
- **H3 fixed 50 ms timeout and serial awaits: confirmed, small.** `loader-shown -> meta-prepass-start` is 57 ms (~8% of an m22 home open, ~1% of c27). `recentFileService.addFile` and `is-currently-searching` sit off the critical path in these runs.
- **H4 backup write on the open path: rejected.** 7-12 ms, fire-and-forget.
- **H5 Selectr built eagerly: rejected.** On c27 `tablelist -> selectr` is 49 ms and `getTableList` 67 ms. The bigger table-editor costs are the page load (`editor-start -> te-start`, 131 ms) and pins init plus first render (`selectr -> ready`, 154 ms).
- **H6 `refreshCurrentPage` on re-open: no measurable effect.** Warm home opens equal cold home opens (694 vs 698 ms on m22). Warm table-editor/schedule opens are faster (879 vs 1108), not slower.

## New findings

- **c27 warm lib-parse is ~1.8x the cold one (3.7 s vs 1.95 s) while the pre-pass gets faster (3.4 s -> 2.1 s).** Looks like memory pressure or GC with the first file still in `activeFiles` (and the previous pre-pass file not released) during the second parse. Worth checking whether the previous file is closed on re-open. Not an app-only issue until confirmed.
- Warm table-editor `editor-ready` is half the cold one (188 vs 401 ms on m22): first-time editor load and Handsontable init.
- The gap check holds by construction here (overhead = total - lib-parse); a missing-mark gap would show as dropped runs, and none remained after the fixes.

## Ranking for the follow-up optimisation plan

1. Remove the pre-pass (read `format` cheaply, or open once and reuse): saves ~0.5 s (m22) / ~3.4 s (c27) cold.
2. Table editor start: page load + pins + first render, ~400 ms cold.
3. Metadata build count and size (2-4 builds, up to 1 MB): needs its own timing.
4. 50 ms timeout and other serial waits: ~60 ms.
5. Library-attributed time (for the `madden-franchise` pass): parse 124 ms / 1.95 s, plus the schema-resolve portion of the pre-pass, plus the c27 warm-parse slowdown.

## Caveats

- Dev run, not packaged; compare same-flag runs only.
- Hidden or occluded windows drop runs (first full pass lost 11 to this). Keep the screen on.
- Not run: `autoSave` on, and the second variance pair on one cell (the c27 re-runs serve as the variance check: medians within ~10%).

## After steps 1-3 (pre-pass sniff, cached metadata, no fixed delay)

Results: `test/perf-results/20261018-2209-after-step1-3-1a42754/`. Medians, ms.

| file | editor | open | baseline M-open-total | after | metadata builds |
|---|---|---|---|---|---|
| m22 | home | cold | 698 | 540 | 2 -> 1 |
| m22 | home | warm | 694 | 158 | 2 -> 1 |
| m22 | table-editor | cold | 1108 | 908 | 3 -> 1 |
| m22 | schedule | cold | 1018 | 652 | 4 -> 1 |
| c27 | home | cold | 5391 | 3451 | 2 -> 1 |
| c27 | home | warm | 6119 | 1851 | 2 -> 1 |

Pre-pass is now ~8 ms cold / ~2 ms warm. Cold m22 home (540) misses the <250 ms target because the library parse (~480 ms cold) now runs once but un-warmed; the pre-pass previously warmed it. Warm opens meet the targets. The c27 warm-parse slowdown shrank (3.7 s -> 1.8 s median) but p90 is still 2.9 s.

## After step 5 (close the previous file on re-open)

Results: `test/perf-results/20261019-2012-after-step5-086a6c6/` (c27 open-home, 10 runs). No caller ever invoked `franchiseAPI.closeFile`, so every opened file stayed in `activeFiles` for the session. The renderer now closes the previous `fileId` before opening a new one, and on the `close-file` menu event.

| file | editor | open | median before | median after | p90 before | p90 after |
|---|---|---|---|---|---|---|
| c27 | home | warm | 1851 | 1841 | 2900 | 1895 |
| c27 | home | cold | 3451 | 3430 | | 3479 |

Median is unchanged, but the warm tail is gone (p90 -35%). The remaining c27 cost is library parse (~3.4 s cold, ~1.8 s warm), out of scope for the app. Unit tests (49) and e2e (24) pass.
