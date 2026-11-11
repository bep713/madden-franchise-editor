# Plan: cut e2e wall time by at least 50%

Supersedes `.claude/plans/e2e-parallelization/plan.md` (Oct 23, written when there were 24 tests). Only its B1 (`options.preferences` in `launchWithDefaultOptions`) was implemented. This plan reuses its findings on shared state, the clipboard and window occlusion.

## Goal and baseline

The CI e2e step takes more than 20 min. Target: no more than 10 min, with no new flaky tests.

Local baseline (HTML report from 9 Nov): 112 tests (111 passed, 1 skipped), **18.2 min** of test time on `workers: 1`. About 95 Electron launches, each one opening the 3 MB m22 career file.

| Area | Time |
|---|---|
| react `cell-edit` | 280s |
| v4 `bulk-edit` | 178s |
| react `context-menu` | 101s |
| react `inverted-edit` | 72s |
| react `notifications` | 66s |
| react `external-change` | 63s |
| whole v4 project | ~280s (~26%) |

The slowest tests (30–69s) save, close Electron and launch it again to check the saved file.

## Order

| Step | What | Expected gain |
|---|---|---|
| 0 | Measure CI and per-phase timings | — |
| 1 | Per-test sandbox file + app fixture (`workers: 1`, no behavior change) | 0 |
| 2 | Clipboard lock + anti-occlusion flags | 0 |
| 3 | Run tests in parallel (`fullyParallel`, 3 local / 2–3 CI) | ~2–3× |
| 4 | Check saved files on disk instead of relaunching | ~2–3 min of test time |
| 5 | v4 project on nightly only, React plus v4 smoke on PRs (**needs your decision**) | −4.7 min of test time |
| 6 | Trace only on retry; `retries: 1` | measure |
| 7 | Small sleep and timeout cleanups | <1 min |
| 8 | (Only if CI is still over 10 min) shard into 2 jobs | ~2× wall time |

Steps 1–3 come first, because nothing else matters as much as parallelism and they're also what makes it safe. Each step lands and goes green on its own.

**Rejected:** sharing one app across the tests in a spec file. State leaking between tests is the main source of flakes, and per-test launches only cost about 2–3s each once tests run in parallel. (This is the old plan's B6.)

---

## Step 0: Measure

- Read the last few `test.yml` runs in the GitHub UI (`gh` isn't installed locally). Note the time of each step in `build-and-test`: `npm ci`, the checks, the builds and `npx playwright test`. Also note any retries (the `github` reporter marks flaky tests). That tells us whether the ">20 min" is all Playwright or partly the checks before it.
- One local run with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728` to get CI-like per-test times. Save the report JSON in the scratchpad so later steps can be compared.
- Time one launch (`launchWithDefaultOptions` → `welcome.waitForPageLoad`) and one file open (`openFranchiseFile`), to get the per-launch cost used in steps 3 and 4.

## Step 1: Sandbox and app fixtures (behavior-neutral)

**Shared state that blocks parallel runs:**
- `FilePaths.m22.career.test`. 28 spec files plus `TestUtil.overwriteTestCareer` read and write it.
- The export outputs `FilePaths.m22.exports.test`, `exports.rawTable.test` and `exports.frtk.test`. These are used by `export.spec.js`, `react/export.spec.js` and `react/inverted-edit.spec.js`.
- `FilePaths.c27.dynasty.test`. Check whether `react/game-type.spec.js` saves to it. If it doesn't, it can stay shared and read-only.
- The `Electron` module singleton (`electron.electron`, `electron.userDataDir`). `util/test.js` (failure artifacts) reads it, and so do `pins.spec.js`, `react/pins`, `notifications`, `schema-management`, `schemaViewer` and `ui-switch`. Each worker is its own process, so this only breaks if a worker runs two tests at once, which it never does. It can stay in step 1. Moving it to a fixture is optional cleanup.

**1a. Sandbox fixture** in `tests/e2e/util/test.js`, test-scoped, added to the existing `base.test.extend`:
- `sandbox`: `mkdtemp(os.tmpdir()/mfe-e2e-sandbox-)`. It copies `FilePaths.m22.career.pristine` in as `CAREER-E2ETEST` and provides `{ dir, careerPath, exportPath, rawExportPath, frtkExportPath }`. It deletes the folder on teardown with `rmSync(..., { maxRetries: 3 })`, after the app has closed.
- The fixture is lazy. Tests that don't take `sandbox` pay nothing.
- `FilePaths.m22.career.test` and the three `exports.*.test` entries are removed, so any use that was missed fails loudly instead of silently sharing a file.
- `TestUtil.overwriteTestCareer` and every `beforeAll/beforeEach/afterAll(overwriteTestCareer)` are deleted.

**1b. Spec migration.** For each spec that uses `FilePaths.m22.career.test`, take `{ sandbox }` in the test (or `beforeEach`) and pass `sandbox.careerPath`. Helpers like `openPlayerTable()` and `readPlayerFieldFromDisk()` take the path as a parameter or read it from a variable set per test.
- Specs that use `beforeAll` to launch one app shared by several tests (`back-button`, `pins`, `import`, `inverted-edit`, `tabs`, …) can't use a test-scoped fixture in `beforeAll`. For those, either:
  - move the launch into each test, which is fine because each has 1–4 tests, or
  - copy the career into the spec's own `mkdtemp` in `beforeAll` using a plain helper `makeSandbox()`, exported from `util/sandbox.js` and also used by the fixture.

  Prefer `makeSandbox()`, so this step doesn't change how many times the app launches.
- `import-roundtrip.spec.js` only reads the pristine file and needs no change.
- This is mechanical and repetitive across about 28 files, so it can go to a `haiku` subagent once 1a is in place.

**1c.** Remove `tests/data/m22/career/test/` and `export/test/` from use. Check `.gitignore`, and keep the folders if anything else expects them.

**Gate:** `npx playwright test` with `workers: 1` is green. `git status` shows `career/CAREER-M22TEST` untouched.

## Step 2: Clipboard lock and occlusion flags

**2a. Clipboard.** `App.copyToClipboard` (`tests/e2e/models/App.js:86`) writes the OS clipboard from main, and the paste is a real Ctrl+V (`models/react/Grid.js:74` → `util.sendPasteKeyboardShortcut`). Two workers pasting at once would paste each other's text.
- New `tests/e2e/util/clipboardLock.js` exporting `withClipboardLock(fn)`. It's a lock that works across processes: an atomic `fs.mkdirSync` of `os.tmpdir()/mfe-e2e-clipboard.lock`, retried every 50ms. A lock older than 60s counts as stale and is taken over, which covers a crashed worker. It's released in `finally`.
- New `App.pasteText(window, text)`, which does copy + Ctrl+V + waits until the paste is consumed, all under the lock. "Consumed" means the grid's `paste` handler ran. Use the existing `watchForLoader` flag, or for small pastes poll until the selected cell's text changes. The lock is held only up to that point, not for the processing after it.
- Call sites switch to it: `react/cell-edit.spec.js:98` (`pasteColumn`), the 5 sites in `react/inverted-edit.spec.js` and the 5 in `bulk-edit.spec.js`. Then make `copyToClipboard` private (`_copyToClipboard`), so a new spec can't skip the lock.
- Fallback, only if the lock turns out flaky: dispatch a synthetic `paste` event with a `DataTransfer`. That needs no lock but no longer tests the real Ctrl+V path.

**2b. Occlusion and throttling.** Chromium throttles windows that are hidden behind others, which stalls timers and `requestAnimationFrame`. Add these to the args in `launchWithDefaultOptions` (test-only, `main.js` doesn't change):
- `--disable-renderer-backgrounding`
- `--disable-backgrounding-occluded-windows`
- `--disable-features=CalculateNativeWinOcclusion`

**Gate:** still `workers: 1`, green.

## Step 3: Run tests in parallel

`playwright.config.js`:
- `fullyParallel: true`. Tests inside a file run in parallel too, which is safe because every test now has its own sandbox. Specs that launch one app in `beforeAll` and share it across tests need `test.describe.configure({ mode: "serial" })` at the top. List them while doing step 1b.
- `workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : process.env.CI ? 2 : 3`. Try CI at 3 once 2 is stable (windows-latest has 4 vCPU).
- Timing-sensitive limits: `MAX_BULK_PASTE_MS = 15000` (`react/cell-edit.spec.js:22`, and the v4 equivalent in `bulk-edit.spec.js`). Don't raise them up front. If the repeat runs below show real variance under load, raise them once and note why.
- `CLAUDE.md` currently says "Tests run with one worker". Update that and document `E2E_WORKERS`, the sandbox fixture and the clipboard lock.

**Gate:**
1. `npx playwright test --workers=3 --repeat-each=3` locally: 0 failures, 0 flaky.
2. The same with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728`.
3. A CI branch with `workers: 2`: 3 green runs in a row, and compare the Playwright step's duration with step 0.

## Step 4: Check saved files without relaunching

Tests that save, close Electron and relaunch just to read the result back:
- `react/cell-edit.spec.js` `saveAndReopenPlayerTable` (`:57`), used twice in "undo and redo…" (69s)
- `react/context-menu.spec.js:335` "Set as next empty record…" (65s)
- `bulk-edit.spec.js` (v4) has the same helper; that test takes 65s
- Also check `react/save.spec.js`, `react/inverted-edit.spec.js` and `react/back-button.spec.js` with `grep "electronApp.close()"` in the middle of a test

Change:
- Move `readPlayerFieldFromDisk` (`react/cell-edit.spec.js:72`) into a shared `tests/e2e/util/diskReader.js`: `readTableFromDisk(filePath, tableId, fields?) → { records, header, emptyRecordIndices }`. It parses in the test process with `madden-franchise`, the same way `import-roundtrip.spec.js` does. Cache the parsed schema per worker if parsing turns out to be the slow part (measure first).
- After `app.saveFile()`, assert on `readTableFromDisk(sandbox.careerPath, …)` instead of relaunching. This checks the bytes on disk, which is what these tests claim to check.
- Keep **one** real "save, close, reopen in the app" test per UI: `react/save.spec.js` "edit, save, close and reopen" already exists, and v4 `bulk-edit` keeps one. That way the reopen path stays covered.
- The second half of "undo and redo…" (redo) then no longer needs a relaunch. Optionally split it into `undo…` and `redo…` tests so they run in parallel.
- Emptiness at the UI level ("record 373 no longer has empty styling after reopen") stays checked in the same session. The test that the empty-record chain survives the save becomes a disk read of `header.nextRecordToUse` and `emptyRecordIndices`. Check that the library computes these the same way the app's IPC does (`readTableData` in main); if not, compare raw fields.

**Gate:** the edited specs pass with `--repeat-each=3`. Each edited test is at least 40% faster in the report.

## Step 5: Run v4 on nightly only (decision needed)

`CLAUDE.md` currently says "the `v4` e2e project stays in CI". **Confirm before doing this.**
- Add an input `playwright-args` (default empty) to the composite action `.github/actions/build-and-test/action.yml`, appended to `npx playwright test`.
- `test.yml` (PRs) runs the React project plus v4 `smoke` and `pins`. Use a tag (`@pr` in the title of those two v4 tests) and run `--project=react` and `--project=v4 --grep @pr` as two commands, or a single grep-invert on a `@full` tag. Two commands is simpler. The input then becomes a `pr-only: true` flag that picks between them.
- `nightly.yml` and `release.yml` keep the full suite (no input).
- If `pr-only` is set, the v4 build steps (`sass:build`, `build:renderer`) still have to run, because v4 smoke needs them.
- Update CLAUDE.md's CI paragraph and the "v4 stays in CI" sentence.

**Gate:** a PR run shows only React + v4 smoke and pins. A manual `workflow_dispatch` of nightly (or the next push to master) runs everything.

## Step 6: Tracing and retries

- `tests/e2e/util/Electron.js:96` starts tracing with `screenshots: true, snapshots: true` on every launch. Measure one heavy spec (`react/cell-edit`) with and without it. If it costs more than about 5%, add a `trace` option to `launchWithDefaultOptions` and have tests pass `trace: testInfo.retry > 0`, so the first attempt runs without tracing. The fixture has `testInfo`, and specs that launch in `beforeAll` get it from `test.info()`. The failure screenshot in `util/test.js` still works without a trace, but `tracing.stop` must be skipped when tracing never started (it already sits in a try/catch).
- `retries: process.env.CI ? 1 : 0` (currently 2). A test that fails twice is broken, not flaky.

## Step 7: Small cleanups

- `react/notifications.spec.js:318` `wait(9 * 1000)` ("hovering keeps the banner up"): if `src/renderer/src/banners/BannerContext.test.tsx` already covers pausing on hover (check the test names), cut the e2e test down to "hover, then the banner is still up after it slid in" with no 9s wait, or delete it. If vitest doesn't cover it, add the vitest case first.
- Fixed sleeps that prove "nothing happened" (`react/cell-edit.spec.js:312` 1s, `:332` 3s, `external-change.spec.js:61/204/272`, `notifications.spec.js:338`): keep them. They are negative assertions, and the total is under 10s.
- Fixed `TestUtil.wait` calls in v4 specs (`export.spec.js:83/89`, `import.spec.js:63`, `releaseNotes`/`updateChannel` 500ms): replace with polling only if you're already editing those files.

## Step 8: Sharding (only if needed)

Only if CI wall time is still over 10 min after steps 3–6.
- `test.yml`: matrix `shard: [1, 2]` → `npx playwright test --shard=${{ matrix.shard }}/2`. Each shard repeats `npm ci` and the builds (about 2–3 min), so this only pays off when the Playwright step is over about 6 min.
- Report: upload each shard's `playwright-report` with a unique artifact name. `@playwright/test` 1.25 has no `merge-reports`, so the reports stay separate.

---

## Files to touch

- `playwright.config.js`: `fullyParallel`, `workers`, `retries`
- `tests/e2e/util/test.js`: `sandbox` fixture
- new `tests/e2e/util/sandbox.js` (`makeSandbox`), `clipboardLock.js`, `diskReader.js`
- `tests/e2e/util/Electron.js`: occlusion flags, `trace` option
- `tests/e2e/util/FilePaths.js`: remove `career.test` and `exports.*.test`
- `tests/e2e/util/TestUtil.js`: remove `overwriteTestCareer`
- `tests/e2e/models/App.js`: `pasteText`, `copyToClipboard` made private
- All specs under `tests/e2e/scripts/` that use the career file or the export outputs (about 28)
- `.github/actions/build-and-test/action.yml`, `.github/workflows/test.yml` (step 5, step 8)
- `CLAUDE.md`: test section (workers, sandbox, clipboard lock, `E2E_WORKERS`, v4-in-CI policy)
- Mark `.claude/plans/e2e-parallelization/plan.md` as superseded

## Verification (whole plan)

- `npm run test:unit`, `npm run build:react`, `npm run sass:build`, `npm run build:renderer`
- `npx playwright test --workers=1` green after steps 1 and 2
- `npx playwright test --workers=3 --repeat-each=3` green, then again with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728`
- `git status` clean afterwards: the pristine fixtures are unchanged and no stray files are left in `tests/data`
- 3 green CI runs in a row on the branch. The Playwright step's time should be no more than 50% of the step 0 baseline, with 0 flaky tests reported
- Check the diff against this plan, and especially that every test still checks what it claimed to (step 4 swaps relaunches for disk reads but keeps one real reopen test per UI)
