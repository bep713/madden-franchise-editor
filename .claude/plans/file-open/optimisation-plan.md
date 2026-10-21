# Plan: speed up opening a file

Also copy to `.claude/plans/file-open/optimisation-plan.md` as step 0 (repo convention).

## Context
The baseline (`.claude/plans/file-open/file-open-baseline.md`, contract in `file-open-baseline-contract.md`) shows the app-side cost of opening a file is dominated by the **pre-pass**: `getMetadataFromFilePath` does a full `FranchiseFile.create` (schema resolve + parse of every table) and discards the result, only to read `format`. That is 494 ms of a 698 ms home open on m22 (71%) and 3.4 s of 5.5 s on c27 (62%). Secondary costs: table-editor start (~400 ms cold), 2-4 metadata builds per open (0.5-1 MB over IPC), a fixed 50 ms timeout. H4 (backup), H5 (Selectr) and H6 (refresh on re-open) were rejected by the baseline, so they are out of scope. Goal: land the pre-pass removal first (≈ -0.5 s m22, ≈ -3.4 s c27), then the smaller wins, re-measuring with the existing harness after each.

## Findings that shape the fix (verified)
- Only `initialMetadata.format` is used from the pre-pass (`renderer/js/services/navigationService.js:697-704`); it gates the FTC override modal.
- Library (`node_modules/madden-franchise/dist/index.cjs` v4.3.7): `format` comes from `getFileType`/`getFormat` (8157-8210), which needs only the first bytes and file size: first 4 bytes `FrTk` = uncompressed, else compressed; compressed + first two bytes `78 9c` = `franchise-common`, otherwise `franchise`; uncompressed: `size > 0x895440` = `franchise`, else `franchise-common`. `getFileType` is not exported. `new FranchiseFile(path, {autoParse:false})` still reads and decompresses the whole file but skips schema/table work (`create` resolves immediately).
- The pre-pass also omits `schemaDirectory`, so it resolves schemas differently from the real open (extra reason it is slow and wasteful).
- The library has no close/dispose; `closeFile` is `activeFiles.delete` (`FranchiseFileManager.js:394`). Unreleased references may explain the c27 warm-parse slowdown (3.7 s vs 1.95 s).

## Steps (one commit each, measure after each)

### 1. Replace the pre-pass with a cheap format sniff (biggest win)
- `main/services/FranchiseFileManager.js:1149-1158`: change `franchise:get-metadata-from-file-path` to call a new helper `detectFormat(filePath)` (put in `main/utils/`, with a unit test in `tests/unit/`). The helper opens the file, reads 4 bytes, `fstat`s the size, applies the rules above, and returns `{ format }`.
- Fallback: if the header is unrecognised or the helper throws, use `FranchiseFile.create(path, { autoParse: false })` and read `file.type.format` (still avoids schema + table parse). Keep the same return key (`format`) so `navigationService.js` and the preload (`franchisePreload.js:74-76`) need no change; the other metadata fields were never read by the caller.
- Unit tests: compare `detectFormat` to the library's `new FranchiseFile(p,{autoParse:false}).type.format` on the m22 and c27 fixtures (`tests/data/m22`, `tests/data/c27`), plus synthetic headers for each branch.
- Expect `M-pre-pass` to drop to a few ms.

### 2. Reduce metadata builds and IPC payload
- `getMetadata` is re-fetched by `TableEditorWrapper.js:55`, `scheduleService.js:28`, `FranchiseSchedule.js:35` although `openFile` already returned the same metadata and `navigationService.currentlyOpenedFile.metadata` holds it (reloaded on `load-schema`, `navigationService.js:639`). Have those callers read the cached value; keep `getMetadata` IPC only for refresh after schema change/save-as. Target: 1 build per open (down from 2-4).
- Confirm with `open:metadata-built` marks (count and bytes). Time `_buildMetadataUntimed` separately before deciding whether trimming `tables` (e.g. lazy table list) is worth it.

### 3. Remove serial waits
- `welcomeService.js` `openFileFromPath`: drop the fixed `setTimeout(50)` in favour of `requestAnimationFrame` x2 (loader paints, no fixed delay). Expect ~50-60 ms.
- Keep `recentFileService.addFile` concurrent with the open (already off critical path).

### 4. Table editor start (~400 ms cold)
- Per the baseline the cost is page load (`editor-start -> te-start`, 131 ms) and pins init + first render (`te-selectr -> te-ready`, 154 ms). Look at `TableEditorWrapper.start` (`:49-94`) for work that can overlap (`getTableList` and pins init in parallel; page-HTML fetch started while `openFile` IPC is in flight when `defaultEditor` is `open-table-editor`). Lower priority; do only if steps 1-3 leave it as the top item.

### 5. Investigate the c27 warm-parse slowdown
- Check whether re-opening closes the previous file (`closeFile`) before parsing the new one; if not, close it first (and drop pre-pass references, which step 1 removes anyway). Re-run `--warm` c27 and compare. If still slow, record it for the `madden-franchise` pass (out of scope here).

## Delegation
Steps 1 and 3 are small and specific: implement directly. Step 2 touches three renderer files: a Sonnet subagent can do it from this plan; I review the diff. Step 4/5 are investigations (Sonnet Explore for file:line pointers first). Haiku is not worth using here.

## Verification
- `npm run test:unit` (new `detectFormat` tests), then `npm run e2eTest` (opens files through the real flow, including both formats on m22).
- Manual: open an FTC/franchise-common file and confirm the override modal still appears; open a file with no embedded schema and confirm the "does not contain schema data" path still works.
- Perf: `node scripts/perf-file-open.js --file both --editor all --runs 10 --warm --label after-stepN`, compare same-flag medians with `test/perf-results/20261018-2129-baseline-b0d667b/`; update `file-open-baseline.md` with a before/after table. Success: m22 home open < ~250 ms (from 698), c27 < ~2.2 s (from 5.5 s), metadata builds = 1.
- Keep the screen on during runs (hidden windows drop runs).

## Out of scope
`madden-franchise` internals (parse speed, schema resolution, dispose API), save/export/import timing, startup.
