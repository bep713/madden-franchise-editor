# Plan: e2e trim phase 3 — check saved files on disk instead of relaunching

Detail for Phase 3 of `.claude/plans/e2e-trim.md`. Decisions only.

**Status:** done and committed 11 Nov 2026. Results are in the main plan's Phase 3 section.

## Measured first (11 Nov 2026)

A fresh `FranchiseFile.create` of the M22 career with an empty schema dir takes 115–172 ms; `readRecords(["LastName"])` on Player (4220) takes 14 ms. **No schema cache.** A fresh parse gives `header.nextRecordToUse` (Player 696, Team 50, OverallPercentage 21) and `emptyRecords` is a `Map`.

## 3a. `tests/e2e/util/diskReader.js` (new)

```
readTableFromDisk(filePath, tableId, fields?) → Promise<{ records, emptyRecordIndices, header } | null>
readSavedTable(filePath, tableId, fields?, { timeout = 30000, message }?) → Promise<{…}>   // polls until non-null
```

- `FranchiseFile.create(filePath, { schemaDirectory: mkdtemp, saveOnChange: false })`, `getTableById`, `readRecords(fields)` (the library takes the field list, as main does at `FranchiseFileManager.js:1035`).
- `records`: each record trimmed to `fields` (`Object.fromEntries`), like `App.readTable`. With no `fields`, plain objects of every field of the table's `offsetTable`. In practice every caller passes fields.
- `emptyRecordIndices`: `[...table.emptyRecords.keys()].map(Number).sort((a, b) => a - b)`. Only the `Map` branch of `_serializeEmptyRecordIndices`, since that's what the library returns.
- `header: { nextRecordToUse }`.
- Any throw → `null`. Temp dir removed in `finally`.
- `readSavedTable` wraps it in `util/poll.js` `poll` (predicate `!== null`). Used after `app.saveFile()`, which awaits the save IPC, so it normally succeeds on the first try. The poll only covers a file mid-write.

## 3b. Spec changes

**`react/cell-edit.spec.js`**
- `readPlayerFieldFromDisk(field, row)` → thin wrapper: `(await readTableFromDisk(careerPath, PLAYER_TABLE_ID, [field]))?.records[row][field] ?? null`. Drop the `fs`/`os`/`path`/`FranchiseFile` imports.
- "undo and redo after a bulk paste…": after the undo, `app.saveFile()` + `readSavedTable(...)` slice equals `originalNames`. Then **Ctrl+Y directly** in the same session (the re-paste + undo existed only because the reopen cleared the undo stack), check the grid, save, disk slice equals `pastedNames`. Remove `saveAndReopenPlayerTable` and `test.setTimeout(180s)`. The `let tableEditor` becomes `const`.

**`bulk-edit.spec.js` (v4)** — same undo/redo change. Remove `saveAndReopenPlayerTable` and `test.setTimeout(120s)`. Uses `expect` from `util/test` (Playwright), so `toEqual`.

**`react/context-menu.spec.js`** "Set as next empty record to use…": replace the "survives a save and reopen" block with `app.saveFile()` + `readSavedTable(careerPath, PLAYER, ["LastName"])` → `header.nextRecordToUse === 375`, `emptyRecordIndices` excludes 373/374 and includes 375. The grid check of 373 after reopen goes (the in-session grid check above it already covers the styling). Drop `test.setTimeout(120s)`; `let tableEditor` → `const`. If the fresh-parse `nextRecordToUse` doesn't equal 375 when run, fall back to comparing the first-4-byte pointer per the main plan and say so.

**`react/empty-records.spec.js`**
- Test 1: after `waitForEmptyRows([3, 6])`, save + disk read → `emptyRecordIndices` `[3, 6]`. Un-empty on the existing `tableEditor`/`grid`, not `reopened`. The grid's (6,0) empty check is already done above.
- Test 4: at the start, read the in-session table once (`app.readTable(TABLE_ID)`, small) and keep record 6 plus the first two column names from `headers`. After the final undo: save + disk read with those two fields → `emptyRecordIndices` `[3]` and disk record 6 equals the original record 6. The post-reopen grid checks of (6,0), (6,1), (3,0) stay, in the same session.

**`react/inverted-edit.spec.js`** "export and import…": step 9 becomes save + `readSavedTable(careerPath, TEAM, ["LongName"])` → `records[5].LongName === "InvertedImport"`. Drop the "reopened table starts normal" check (covered by "the orientation belongs to the tab's current table"). `let tableEditor` → `const`. Keep its `test.setTimeout(150s)` for now; the Phase 5 timings decide.

**`react/save.spec.js`** "save as…": replace `readLongNameOf` and the two launches with `readSavedTable(savePath, 7482, ["LongName"])` (`records[52]`) and the same for `careerPath`. `electronApp.close()` stays where it is (before the reads, so the file isn't held). `openTeamTableFrom` becomes unused → remove.

**Kept as real reopens:** `react/save.spec.js` "edit, save, close and reopen", v4 `smoke.spec.js`, both import specs' "fields persist after saving".

## Verification

1. Baseline JSON timings of the 6 edited specs at the current commit:
   `PLAYWRIGHT_JSON_OUTPUT_NAME=<scratchpad>/before.json npx playwright test <6 files> --reporter=json`
2. After: same command to `after.json` with `--repeat-each=3`. All green. Each of the 7 edited tests ≥ 40% faster (mean of 3).
3. `npm run lint` is unaffected (e2e isn't linted); `npm run test:unit` untouched.
4. Review the diff against this plan; update `.claude/plans/e2e-trim.md` and memory with the numbers.

Needs `npm run build:react`, `sass:build` and `build:renderer` before running.
