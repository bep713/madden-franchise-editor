# Plan: speed up the e2e suite without adding flakes

## Context
`playwright.config.js` pins `workers: 1`, so the 24 tests (~4 min in total) run back to back. `bulk-edit.spec.js` alone is ~2m11s, and its slowest test is 46s. The aim is to (1) run tests in parallel safely and (2) cut the slow tests' own time. Flake-free matters more than raw speed, so every step is gated on repeat runs.

## Findings (what is and isn't shared)

Already isolated, no work needed:
- Each launch gets its own `userData` through `mkdtemp` + `--user-data-dir` (`tests/e2e/util/Electron.js:48`). That covers preferences, pins, recent files, schemas, backups and the chokidar watcher. A per-run AppData sandbox is not needed.
- `import-roundtrip.spec.js` runs in plain Node, reads only the pristine career file and uses its own tmp dir. It is parallel-safe as is.
- `releaseNotes`, `updateChannel` and the pins "legacy" test touch no shared files.

Real shared state, which will break parallel runs:
1. **The career file `career/test/CAREER-E2ETEST`** (`FilePaths.m22.career.test`). Every app test saves to it, and `beforeAll`/`afterAll` call `overwriteTestCareer` on it. One worker's `afterAll` would overwrite the file under another worker's open test.
2. **Export outputs** `export/test/{export.xlsx, raw.dat, frtk-test.frt}` (`export.spec.js`). They are fixed paths that the test deletes and re-reads.
3. **The OS clipboard.** `App.copyToClipboard` writes through the Electron main process, and `Ctrl+V` pastes from the system clipboard. Two instances running bulk-edit paste tests would paste each other's data. This is the sneakiest one.
4. **The `electron` singleton** in `Electron.js` (`this.electron`, `this.userDataDir`), also read by the `failureArtifacts` fixture in `util/test.js`. It is safe per worker process, but only while a worker runs one test at a time. It should become a per-test fixture.
5. **Windows occlusion and background throttling.** Several Electron windows stacked on one desktop can be throttled by Chromium when occluded. That stalls `requestAnimationFrame` and timers, so the loader and Handsontable waits become timing-dependent.
6. **CPU contention.** `MAX_BULK_PASTE_MS = 15000` (`bulk-edit.spec.js:19`) and the 5s expect timeout are tuned for an idle machine. The 2,500-cell paste is the likely first flake.
7. Tooling: `@playwright/test` is 1.25 (no project `dependencies`, no `--only-changed`). `testInfo.parallelIndex`, worker fixtures, `fullyParallel` and `describe.configure` all exist in 1.25, so none of this needs an upgrade.

## Part A: make parallel safe (do first, keep `workers: 1` until it's green)

A1. **Sandbox fixture** in `tests/e2e/util/test.js`, test-scoped, extending the existing `base.test.extend`:
- Creates `mkdtemp(os.tmpdir()/mfe-e2e-sandbox-)`, copies `FilePaths.m22.career.pristine` into it as `CAREER-E2ETEST`, and provides `{ careerPath, exportDir }`. It deletes the directory on teardown.
- This replaces `beforeAll`/`afterAll(overwriteTestCareer)` in all 8 app specs. The pristine file is never written, and the gitignored `career/test` and `export/test` dirs go unused.
- `FilePaths.m22.career.test` and `exports.test/rawTable.test/frtk.test` become sandbox-relative. `export.spec.js` and `import.spec.js` take their paths from the fixture. Keep `exports.*.compare` and `imports.*` as the read-only fixtures.

A2. **App fixture** replacing the `Electron` singleton. `electronApp` launches via `launchWithDefaultOptions`, wraps it in `App`, and always closes it on teardown, even when the test fails. This removes the leaked-process risk and the `app?.close()` `afterEach` boilerplate. `failureArtifacts` reads the app from the fixture instead of the module-level `electron.electron`. Keep `Electron.js`'s `buildTestPreferences` and `userDataDir` cleanup.

A3. **Clipboard lock.** Add `withClipboardLock(fn)` in `tests/e2e/util/`, a cross-process lock built on an atomic `fs.mkdir` of a lock dir in `os.tmpdir()`, with retry and a stale-lock timeout. The paste path holds it from `copyToClipboard` until the paste event is consumed, which is when `loaderWasShown` flips or the first cell updates. The lock is held for ms to seconds, not the long processing. Make `TableEditorPage.pasteAtSelectedCell` or a new `App.pasteText(text)` do copy + Ctrl+V under the lock, so specs can't forget it. This keeps real native-paste coverage. The alternative is dispatching a synthetic `paste` event with a `DataTransfer`, which needs no lock but stops exercising `Ctrl+V`. I'm not choosing it unless the lock turns out flaky.

A4. **Stop occlusion/throttling flakes.** In `launchWithDefaultOptions`, add `--disable-renderer-backgrounding`, `--disable-backgrounding-occluded-windows` and `--disable-features=CalculateNativeWinOcclusion` to the Electron args. This is test-only and doesn't touch `main.js`. Verify the window is created without stealing the user's focus every time (not a flake issue, but annoying locally).

A5. **Config** in `playwright.config.js`:
- Set `fullyParallel: true` and `workers: process.env.E2E_WORKERS ? Number(...) : (process.env.CI ? 2 : 3)`. Start CI at 2, because windows-latest has few cores.
- Keep `retries: CI ? 2 : 0`. Add a flaky-visibility step so a pass-on-retry is surfaced instead of hidden (the `github` reporter already annotates flaky tests).
- Keep `timeout: 60s`. Raise `MAX_BULK_PASTE_MS` only if repeat runs under load show real variance. Prefer measuring first over loosening.

A6. **Gate for A** (nothing proceeds until it passes):
1. `workers: 1` full run is green, to prove the fixture refactor is behavior-neutral.
2. `npx playwright test --workers=3 --repeat-each=5` is green with 0 flaky and 0 retries locally.
3. The same with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728` to mimic CI, then on a CI branch run with `workers: 2`.
4. Run the bulk-edit specs while another app is in the foreground and the machine is loaded, to look for timing sensitivity.

## Part B: speed up the slow tests (each item measured before and after)

B0. **Profile first.** Add `test.step` timing, or temporary `console.time`, around launch / open file / open Player table / `readTable` / `setSetting` / save-and-reopen in the 46s and 20s bulk-edit tests. Don't cut blind. The suspects below are from reading the code.

B1. **Seed preferences at launch instead of driving the settings UI.** `TestUtil.setAutoUnempty`, `setAutoSave` and `setAutoOpenExcel` open Preferences, hard-wait 500ms and click Continue twice, which is several seconds each. Add `options.preferences` (deep-merged into `buildTestPreferences`, mirroring `options.pins`) to `launchWithDefaultOptions`. Drop the trailing `setAutoUnempty(app, false)` calls, which are pointless because `userData` is per launch. Keep one or two tests that cover the settings UI itself. Candidates: `bulk-edit` tests 1 and 2, `export`, and `import` (the first `setAutoSave(false)`).

B2. **Cheaper read-back after save.** `saveAndReopenPlayerTable` closes and relaunches the app, re-opens the Player table and then does a full-table `readTable` (3,960 rows). The "undo/redo are saved to the file" test does it twice (46s). Add a helper that, after `app.saveFile()`, reads the sandbox career file in the test process with `madden-franchise` (as `import-roundtrip.spec.js` already does) and compares the column. That verifies the bytes on disk, which is the claim being tested, without a UI relaunch. Also split it into an undo test and a redo test so they run in parallel.

B3. **Narrow reads.** `readPlayerColumn` and `readEmptyPlayerRows` pull the whole Player table over IPC several times per test. Check whether `readTableData` (see `main/handlers/`) can take a row range or field list. If it can, slice at the source, since most assertions only look at the first 3-2,500 rows. Otherwise cache within a test.

B4. **Remove fixed waits** in `TestUtil` (`wait(500)` in `setSetting`, `wait(250)` in `waitForFile` and `import.spec.js`) in favour of polling for the real condition. `waitForFile` can poll for stable size instead of a 250ms sleep.

B5. **Split the long serial tests** once parallel is on, so wall time approaches the slowest unit rather than the sum:
- `export.spec.js`: one test per export type (xlsx small, raw, frtk, xlsx Player).
- `import.spec.js`: separate small / large / partial-columns / persists-after-save / autosave tests.

  Each split adds one more app launch (~2s), so confirm with B0 data that it nets out positive.

B6. **Don't** share one app across tests or reuse a file between tests. State bleed is the main flake source, and the sandbox fixture is cheap (one file copy).

Expected outcome (estimate, to be confirmed): suite sum is ~4 min. With 3 workers and the splits, wall time should be roughly the longest remaining test (~15-25s after B1-B3) plus scheduling, about 1.5-2 min locally and ~2 min on a 2-worker CI runner.

## Files to modify
- `playwright.config.js` (workers, fullyParallel)
- `tests/e2e/util/test.js` (sandbox + app fixtures, failure artifacts)
- `tests/e2e/util/Electron.js` (chromium flags, `options.preferences`)
- `tests/e2e/util/FilePaths.js`, `TestUtil.js` (sandbox paths, drop `overwriteTestCareer`, remove fixed waits)
- new `tests/e2e/util/clipboardLock.js`; `tests/e2e/models/App.js` (`pasteText`) and `TableEditorPage.js`
- All specs in `tests/e2e/scripts/` except `import-roundtrip` and `releaseNotes`/`updateChannel` (those only change if they adopt the app fixture)
- `CLAUDE.md` test section (describe the sandbox fixture, clipboard lock, `E2E_WORKERS`)

## Verification
- `npm run build:renderer && npm run sass:build`, then `npx playwright test --workers=1` (baseline green).
- `npx playwright test --workers=3 --repeat-each=5`, then with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728`. Require 0 failures, 0 flaky.
- Confirm `career/CAREER-M22TEST` pristine file is byte-identical afterward (`git status` clean).
- Push a branch and check the CI run of `.github/actions/build-and-test` with `workers: 2`, at least 3 consecutive green runs, before merging. Compare the before/after durations in the job log.
- `npm run test:unit` is unaffected but run it as a sanity check.
