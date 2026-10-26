# 03a — Cell editing, reference/blob editors and saving (React)

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Roadmap: [plan.md](plan.md).

## Context
The React grid (`components/TableEditorComponent/TableEditorComponent.tsx`) is read-only. React can't save, and the app menu's Save, Save As and Close File don't work under React. Main only enables those items after the renderer sends `file-loaded`, and React never sends it or listens for `save-file`/`save-file-as`/`close-file`. Import (03c) and every later editing feature depend on cell writes, and some fields (references, JSON blobs) can only be edited properly through v4's reference and blob editors. So this step builds the whole editing path and brings it to v4 parity. v4's code is in `renderer/js/services/table-editor/TableEditorView.js`, `custom-renderers/` and `navigationService.js:584-650`.

Outcome: edits, pastes, fill, undo/redo, enum/bool dropdowns, the reference editor, the blob editor and reference links behave as in v4. Ctrl+S, Ctrl+Shift+S, Ctrl+Shift+X and the File menu work under React.

## v4 behaviour to match
Cell writes (`TableEditorView.js:65-222`):
- `beforeChange` nulls out changes whose old value equals the new one, and cancels the change if none are left.
- `afterChange` ignores the sources `onEmpty`, `cell-write-revert` and `loadData`, filters no-ops again, then calls `franchiseAPI.writeBulkTableCells(fileId, [{tableId, recordIndex: toPhysicalRow(row), fieldName, value}])`.
- For more than one change, the loader shows and the renderer waits a frame before the IPC call.
- Response handling:
  - `success: false` or a throw: revert every change with `setDataAtCell(..., "cell-write-revert")`.
  - Otherwise revert only the entries in `results` with `success: false`.
  - For each row in `records` of the current table: `Object.assign` the record into the source row, so Handsontable keeps the same object; set `recordMeta`; set or clear `cellErrors[recordIndex]`.
  - Rows that went from empty to not empty get their full row re-synced, and their stale empty class is cleared.
  - From `emptyStates`: replace `emptyRecordIndices`, and re-sync only the fields with `offset < 32` of each still-empty record.
  - All sync edits go through `setSourceDataAtCell(edits, "onEmpty")`, followed by exactly one `render()`.
- Cell properties: a cell with an error is `readOnly` and `editor: false`, uses the error renderer and shows the message as a tooltip (`table-cell--error`). A cell in an empty record gets `table-cell--empty` (grey, italic).
- Columns: enum and bool columns use the dropdown editor and renderer. The source is the enum member names, or `["true","false"]` for bools. There is no validator, so main rejects bad values and the cell is reverted. Reference columns use the reference renderer, blob columns (`valueInThirdTable`) the blob renderer, and everything else text. Column widths come from `_calculateColumnWidths`. Row headers are 0-based (`rowHeaders: index => index`).
- Loading a table selects (`rowIndexToSelect`, `columnIndexToSelect`), which defaults to (0, 0).
- Keyboard: Handsontable's defaults, which are the same in v11 and v16. Typing or Enter/F2 edits, Escape cancels, Delete/Backspace clears, Ctrl+C/X/V copy, cut and paste, Ctrl+Z/Y undo and redo, and the fill handle works. All of them go through `afterChange`.

Reference renderer (`ReferenceRenderer.js`):
- A 32-character value with flag `"0"` is parsed with `tableId = bin2dec(v[2..15))` and `recordIndex = bin2dec(v[16..))`.
- If the table exists and `tableId > 0`, the cell shows a link `"<name> - <recordIndex>"` and can't be typed into (`editor = false`). Clicking the link selects that table and row (record, column 0).
- Otherwise the raw binary is shown, and the cell can be typed into.
- Both cases have an edit button that shows on hover and opens the reference editor.

Reference editor (`ReferenceEditor.js`):
- A popover anchored below the cell, or above it if there's no room. It's clamped to the window, with a highlight over the cell and an underlay behind it.
- Fields: Table (`"no table - null value"` (0) plus every `"<id> - <name>"`), Row Index (number, min 0) and Binary (maxLength 32).
- Changing the table or row recomputes the binary with `calculateReferenceBinary(tableId, row) = dec2bin(tableId,15) + dec2bin(row,17)`. Changing the binary sets the table and row from the substrings above.
- **Change** writes the binary with `hot.setDataAtCell`, so it is a normal undoable write, and keeps the editor open. **X** or a click on the underlay closes it and selects the cell again.

Blob editor (`BinaryBlobRenderer.js` / `BinaryBlobEditor.js`):
- The cell shows the first 100 characters (then `...`) and an edit button. It can't be typed into.
- The modal "Edit Blob Data" shows the JSON as text. If the value doesn't parse, it shows `{}`.
- Both **Apply Changes** and a click on the underlay close the modal and write `JSON.stringify(JSON.parse(text))` with `setDataAtCell`, then select the cell again.

Saving and the menu (`main.js:137-175, 535-582, 1056-1066`, `navigationService.js:584-650`):
- Renderer → `file-loaded {path, type, fileId}` → main sets the title, enables `CloseFile`/`RevealInExplorer`/`SaveAs` and starts the file watcher. `pendingSaves` stops our own saves from triggering the external-change prompt.
- `Save` is enabled per nav item (`navigation.ts` `menu.enable/disable`, sent as `menu:enable`/`menu:disable`). The table editor enables it and Home disables it.
- Menu → `save-file` → `franchiseAPI.saveFile(fileId)`.
- `save-file-as` → `showSaveDialog({ title: "Save as...", defaultPath: general.defaultDirectory })` → `saveFileAs(fileId, path)`. The open file stays at its old path.
- `close-file` → `closeFile(fileId)`, clear the state, go Home, then `send("close-file")`. Main then resets the title, disables the menu items, clears `activeFiles` and stops the watcher.
- Main sets the "Saving..."/"Saved" titles on its own (`FranchiseFileManager.js:353`), so they need nothing from the renderer except `file-loaded`.
- autoSave runs in main (`writeBulkTableCells` saves when `saveOnChange` is on). React needs nothing for it.
- v4 has no dirty indicator, so none is added here.

## Decisions (2026-10-25)
- Reference and blob editors are part of this step. The old 03d and 03e are folded in.
- Clicking a reference link navigates now (selects the table and row). The back button, middle-click to a new tab and "find references" stay in the reference-navigation item.
- React handles Close File (Ctrl+Shift+X) in this step.
- The inverted (Switch Orientation) view stays read-only. Editing it is planned separately as [03e-inverted-editing.md](03e-inverted-editing.md).
- Empty-row styling and read-only error cells are shown now. "Set as empty" in the context menu stays in the empty-records item.
- Deviations from v4, all small:
  - Invalid JSON in the blob editor shows an error and keeps the modal open. v4 throws and leaves it half closed.
  - A save error shows a message box. v4 ignores it.
  - Escape also closes both editors.

## Phase 1: Types and preload declarations
- `src/shared/types/franchise.ts`:
  - `CellWrite { tableId; recordIndex; fieldName; value: unknown }`
  - `WrittenRecord { tableId; recordIndex; record; recordMeta; previousRecordMeta; cellErrors: Record<string,string> | null }`
  - `EmptyState { tableId; emptyRecordIndices: number[]; emptyRecords: { index; record }[] }`
  - `WriteBulkTableCellsResult = { success: true; results: { success: boolean; index: number; error?: string }[]; records: WrittenRecord[]; emptyStates: EmptyState[] } | { success: false; error: string }`
  - `SaveFileResult = { path: string } | ErrorResult`

  These shapes come from `FranchiseFileManager.js:824-921, 287-297, 1167-1198, 1260-1270`.
- `src/renderer/src/preload.d.ts`: declare `franchiseAPI.writeBulkTableCells`, `saveFile(fileId, options?)`, `saveFileAs(fileId, path)`, and `electronAPI.send(channel, data?)`, `on(channel, cb)`, `removeAllListeners(channel)`, `preferences.getValue(keyPath)`. 03b declares `getValue` too, so whichever step lands first adds it. The preload itself doesn't change.

## Phase 2: Pure helpers (vitest)
- `src/renderer/src/utils/references.ts`: `bin2dec`, `dec2bin(n, len)`, `calculateReferenceBinary(tableId, row)`, `parseReference(value) → { tableId, recordIndex } | null` (32 characters and flag `"0"`, same substrings as v4), and `formatReference(value, tableName)`. These are ports of `utilService.js:14-22, 207`.
- `src/renderer/src/utils/cellWrites.ts` (no Handsontable import; it works on plain arrays):
  - `IGNORED_CHANGE_SOURCES`: v4's three sources plus HOT 16's data-load sources (`updateData`, `updateSettings`). Check the real source names while implementing.
  - `dropNoopChanges(changes) → remaining` mutates the array in place, as v4 does.
  - `toCellWrites(changes, tableId, toPhysicalRow) → CellWrite[]`.
  - `planWriteResult(table, changes, response, state) → { reverts, recordUpdates, cellErrors, emptyRecordIndices?, sourceEdits, unemptiedRows }`. It carries v4's steps 1-3 as data. `state` holds the mutable `cellErrors` / `emptyRecordIndices`.
  - `getRowEdits(headers, row, record)` and `getEmptyRecordRowEdits(headers, row, record)` (only `offset < 32`).
- `src/renderer/src/components/TableEditorComponent/columns.ts`:
  - `buildColumns(headers, renderers) → ColumnSettings[]`. Enum/bool → `editor: 'dropdown', renderer: 'dropdown', source` (not `type: 'dropdown'`, which adds a validator v4 doesn't have). Reference → reference renderer. Blob → blob renderer, `editor: false`. Other → text. All with `wordWrap: false`.
  - `calculateColumnWidths(headers)`, a port of `_calculateColumnWidths`.
- `src/renderer/src/utils/popover.ts`: `placePopover(anchorRect, size, viewport) → { top, left }`, the below/above/clamp rule from `ReferenceRenderer._referenceEditorOnClick`.

## Phase 3: Editable grid
`TableEditorComponent.tsx`:
- New props:
  - `fileId`
  - `tableNames: Map<number, string>`, built from `OpenFranchiseFile.tables` in `TableEditor` with `useMemo`
  - `setLoaderOptions`
  - `initialSelection?: { row; col }`
  - `onFollowReference(tableId, recordIndex)`
  - `onEditReference({ row, col, value, anchorRect })`
  - `onEditBlob({ row, col, value })`
- Expose `forwardRef` / `useImperativeHandle` → `{ setDataAtCell(row, col, value), selectCell(row, col) }`. The editors write through `setDataAtCell`, so they take the normal write path and can be undone, as in v4.
- **Don't let the grid re-render because of the parent.** The react-wrapper sends every prop to `updateSettings` on each update (`react-handsontable.js:2045`). HOT 16 then reloads `data` whenever it's passed (`core.js:2565`), which clears the undo stack and the selection. So:
  - wrap the component in `React.memo`
  - `useMemo` the headers, columns and widths per `table`
  - pass stable hook functions (`beforeChange`, `afterChange`, `cells`) that read the latest props from refs
  - `setLoaderOptions` is already stable (`useLoader` `useCallback`)

  Showing or hiding the loader during a paste re-renders `TableEditor` / `FieldEditorView`. The grid must not reload when that happens. The undo-after-paste e2e test catches this.
- New hook `components/TableEditorComponent/useCellWrites.ts`:
  - It owns `cellErrors` / `emptyRecordIndices` refs, reset when `table` changes.
  - `beforeChange` → `dropNoopChanges`.
  - `afterChange` → skip ignored sources. For more than one change, show the loader (`"Saving changes..."`) and wait one frame. Then `writeBulkTableCells`, then `planWriteResult`. Apply the result to `hot`: reverts with `setDataAtCell(..., 'cell-write-revert')`, `Object.assign` the records, clear the class meta on un-emptied rows inside `hot.batch`, `setSourceDataAtCell(sourceEdits, 'onEmpty')`, one `render()`. Hide the loader in `finally`.
  - Writes run concurrently, as in v4. There is no queue.
- `cells(row, col)` follows v4 `_getCellProperties`:
  - Error cells: `readOnly`, `editor: false`, error renderer, `className: 'table-cell--error'`, tooltip.
  - Empty rows: `className: 'table-cell--empty'`.
  - Reference cells whose value resolves to an existing table: `editor: false`. This is decided here instead of in the renderer, as v4 does.
- Renderers in `components/TableEditorComponent/renderers/` (`referenceRenderer.ts`, `blobRenderer.ts`, `errorRenderer.ts`) are plain DOM functions, not React portals, because tables have up to about 4,000 rows. Each calls HOT's `baseRenderer` first, so the className and readOnly classes are kept, then builds the cell DOM:
  - Reference link: `<a data-action="follow-reference" data-table-id data-record-index>`
  - Edit button: `<button data-action="edit-reference|edit-blob" aria-label="Edit reference|Edit blob">`
  - Events use one delegated `click` listener on the wrapper `div`, which finds `[data-action]` and gets the cell from `hot.getCoords(td)`. No listener is added per cell render.
- Settings: `rowHeaders={!isInverted && (i => i)}` (0-based, as v4), `manualRowResize`, `currentRowClassName: 'active-row'`, columns and widths from `columns.ts`, `readOnly` when `isInverted`. After each table load, select `initialSelection ?? (0, 0)`.
- Styles: global `table-cell--empty`, `table-cell--error` and the show-on-hover edit button in `TableEditorComponent.module.css` under `:global(...)`. These are Handsontable `td` classes, and e2e checks `table-cell--empty`, as v4's model does. Colors come from the existing tokens, matching v4's `_table-editor.scss:131`.

## Phase 4: Reference editor, blob editor, link navigation
- New `components/Modal/Modal.tsx`: a portal with an underlay, a header (title plus a header action slot) and content. It has `role="dialog"`, `aria-modal` and `aria-labelledby`, and an `onUnderlayClick` prop. Escape calls `onClose`.
- New `components/ReferenceEditor/ReferenceEditor.tsx`: the anchored popover described above, using `placePopover`, a highlight `div` over `anchorRect`, and an underlay.
  - Table: the existing `Autocomplete`, filtered with Fuse the same way as the sidebar (`TableEditor.tsx:44`).
  - Row Index / Binary: `Textbox` / `input` with labels `Table`, `Row Index`, `Binary`. The buttons are "Change" and a close button with `aria-label="Close"`.
  - Props: `value`, `tables`, `anchorRect`, `onChange(binary)`, `onClose()`.
- New `components/BlobEditor/BlobEditorModal.tsx`: `Modal` titled "Edit Blob Data", with the existing Monaco `TextEditor` (plain text, since `monacoLoader` has no JSON language) holding `JSON.stringify(parsed ?? {}, null, 2)`.
  - "Apply Changes" and the underlay call `onApply(JSON.stringify(JSON.parse(text)))`.
  - Invalid JSON shows an inline error and the modal stays open.
- `FieldEditorView.tsx` holds the editor state (`referenceEdit` / `blobEdit`) and the grid ref, and renders the two editors.
  - Reference Change → `grid.setDataAtCell(row, col, binary)`.
  - Close/apply → `grid.selectCell(row, col)`.
- Link navigation, `TableEditor.tsx`: `onFollowReference(tableId, recordIndex)`.
  - Same table → `grid.selectCell(recordIndex, 0)`.
  - Otherwise set `pendingSelection = { row: recordIndex, col: 0 }` and call `onSelectTable(table)`. `FieldEditorView` passes it as `initialSelection`, and it's cleared after use.
- Remove the reference-editor and blob-editor markup from the commented-out block in `TableEditor.tsx`. The jump-to-column and references-modal markup stays for 03d and the reference-navigation item.

## Phase 5: File menu and saving
- `Welcome.tsx` `initializeFile`: after a successful open, `electronAPI.send('file-loaded', { path, type: metadata.type, fileId })`. A restore after a renderer reload (`useActiveFranchiseFile`) doesn't send it. Main still has the path and menu state from before, the same as in v4.
- New `hooks/useFileMenuCommands.ts`, used in `routes/Layout/Layout.tsx` because it needs `useNavigate` and the file context:
  - Subscribes once to `save-file`, `save-file-as` and `close-file` with `electronAPI.on`. The cleanup calls `removeAllListeners(channel)`, since the preload has no per-callback removal and only React listens in this window. The current file is read from a ref, so the subscription isn't recreated.
  - `save-file` → `saveFile(fileId)`.
  - `save-file-as` → `showSaveDialog({ title: 'Save as...', defaultPath: await preferences.getValue('general.defaultDirectory') })`. If not cancelled → `saveFileAs(fileId, filePath)`.
  - `{ error }` results → `showMessageBox({ type: 'error', ... })`.
  - `close-file` → `closeFile(fileId)`, `setOpenFile(undefined)`, `navigate('/')`, `send('close-file')`.
  - With no file open, all three do nothing.
- New `hooks/useMenuState.ts`, also in `Layout`: on `[pathname, openFile?.fileId]`, find the `navigation.items` entry whose `href` matches.
  - Send `menu:enable` with `item.menu.enable ∩ REACT_MENU_IDS`, and only while a file is open. Send `menu:disable` with `item.menu.disable`.
  - `REACT_MENU_IDS = ['Save']` for now. Later steps add `Export`, `Import` and so on when React handles them, so menu items React can't act on are never enabled.

## Phase 6: Tests
vitest (all with `window.franchiseAPI` / `electronAPI` mocked):
- `utils/references.test.ts`:
  - The v4 smoke vectors: `00100000010110100000000000010010` ↔ (4141, 18) and `00100000011001000000000000011001` ↔ (4146, 25).
  - Flag `"1"` and wrong lengths → `null`.
- `utils/cellWrites.test.ts`:
  - No-op dropping and the cancel case. Ignored sources.
  - Physical row mapping.
  - Full failure → revert all. Partial failure → revert only the failed entries.
  - Records merged in place, so the object identity is kept.
  - cellErrors set and cleared.
  - Un-emptied rows get full-row edits. Empty-state edits only touch `offset < 32`. Rows of another table are ignored.
- `TableEditorComponent/columns.test.ts`: dropdown source for enum and bool, reference/blob/text renderers, the width formula against v4 values.
- `utils/popover.test.ts`: below, above, clamped.
- `ReferenceEditor.test.tsx`: table/row → binary, binary → table/row, Change → `onChange`, X / underlay / Escape → `onClose`.
- `BlobEditorModal.test.tsx` (mock `TextEditor`): pretty-prints the JSON, unparsable → `{}`, valid apply → minified string, invalid → error and no `onApply`, the underlay applies.
- `useFileMenuCommands.test.tsx`: each channel's calls, a cancelled dialog, an error → message box, no file → no-op, the close sequence and its order.
- `useMenuState.test.tsx`: Save is enabled on `/table-editor` with a file open, and not without one. Home disables it.

e2e (`tests/e2e/scripts/react/`, React models in `tests/e2e/models/react/`):
- Models:
  - `Grid.js`: add `setTextAtSelectedCell` (type, Enter, ArrowUp, as in v4's `HotComponent`), `paste` / `undo` / `redo` (through `tests/e2e/util` shortcuts), `isSelectedCellEmpty` (`table-cell--empty`), `editReferenceAtSelectedCell()` (hover, then `[data-action="edit-reference"]`), `editBlobAtSelectedCell()`, and `followReferenceAtSelectedCell()`.
  - `TableEditorPage.js`: `waitForLoaderToShowAndHide()` / `watchForLoader()`, using a MutationObserver flag on `[role="status"][aria-busy="true"]`, as v4's model does.
  - New `ReferenceEditor.js` (labels / roles), `BlobEditor.js`.
  - `App.js` stays unchanged. Use `_clickMenuItem` and `readTable`.
- `util/Electron.js`, additive: `launchWithDefaultOptions({ preferences: { general: {...} } })` merges over the test defaults (`autoSave` / `autoUnempty` are off). This lets specs enable autoUnempty without going through the settings window.
- `react/cell-edit.spec.js`, a port of `bulk-edit.spec.js`'s grid tests on Player 4220:
  - a single-cell edit reaches the file
  - pasting 2,500 cells shows the loader and finishes within 15 s
  - a paste into empty rows un-empties them and removes `table-cell--empty` (with autoUnempty)
  - **undo/redo after a bulk paste, saved and reopened**, which guards against the grid reloading on re-render
  - a paste with one invalid enum value reverts only that cell
  - an enum dropdown edit
- `react/save.spec.js`:
  - Smoke edit and save: 7482 `LongName` row 52 → "Old York".
  - The `Save` item is enabled in the table editor and disabled on Home (read through `electronApp.evaluate(({ Menu }) => ...)`).
  - Save through the `Save` menu item, then also try `Control+S` through the keyboard. If Playwright's synthesized keys don't trigger Electron accelerators, keep the enabled-state assertion plus the menu click, and note it.
  - Close File through the menu → the welcome page and `getActiveFileId()` is null. Reopen → "Old York" is still there.
  - Save As to a temp path (`stubSaveDialog`): the new file has the edit and the original doesn't.
- `react/reference-editor.spec.js`, from `smoke.spec.js`:
  - 7482 `Stadium` row 43 shows "Stadium - 12". Clicking it → "4104 - Stadium" with the cell at (12, 0) selected.
  - 4104 `BathroomInfo` row 18 → the editor shows "4141 - StadiumPartInfo", row 18 and the binary above. Pick 4146 and row 25 → the binary updates. Change, close → "SeasonGame - 25" and the file holds the new binary.
- Blob: find a table in `CAREER-M22TEST` with a `valueInThirdTable` column (a one-off `readTable` sweep). If one exists, add `react/blob-editor.spec.js`: open, edit one JSON value, apply, then `readTable` shows the minified JSON. If not, say so in the implementation notes and rely on vitest.
- `react/smoke.spec.js`: if 4096's first column is a reference, its (0, 0) assertion changes to `formatReference(...)` of the IPC value. 02 planned for this.

## Verification
- `npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`, `npm run test:unit`.
- `npm run e2eTest:react`, also with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728`. Then `npm run e2eTest` for v4 regressions, since only additive helper options change.
- Manually, `npm run dev:react` on a temp copy of the M22 career file, with autoSave off:
  - Type into a cell, Ctrl+Z / Ctrl+Y, the fill handle, Delete.
  - An enum dropdown, and an invalid int (reverted).
  - Reference link navigation, the reference editor, the blob editor.
  - Ctrl+S shows "Saving..." → "Saved" in the title with no external-change prompt. Ctrl+Shift+S, Ctrl+Shift+X.
  - Turn autoSave on and check that an edit saves by itself.
- Review the diff against this plan.


## Roadmap updates (done with this plan)
- **Renumber `03-table-editor-parity.md`**:
  - 03a = this plan
  - 03b = pins (rename `03a-table-pins.md` → `03b-table-pins.md` and fix its "03a" references)
  - 03c = export/import
  - 03d = jump to column
  - 03e = inverted-view editing (new outline)
  - The old 03d reference editor and 03e blob editor are removed, folded into 03a.
  - Rewrite "Ordering and dependencies": 03a goes first, and 03c import depends on it.
- **New `03e-inverted-editing.md` (outline, "Not planned")**:
  - A `(visualRow, visualCol) ↔ (recordIndex, fieldName)` mapping for the inverted data: row = header index, col ≥ 1 = record col-1, col 0 read-only.
  - `useCellWrites` / `planWriteResult` take the mapping. Reverts and sync edits go through it.
  - The inverted data is rebuilt from `table.records` after each write, or updated in place by the mapping.
  - Per-cell column types: `cells()` returns the editor and renderer of the row's header, because a column there holds mixed types.
  - Tests: mapping unit tests and an e2e edit in the inverted view.
- **`plan.md`**:
  - 01 → "Done (`62ce438`)". 02 → "Done (`cbd80c9`, `c257f8a`)".
  - Row 03 lists 03a cell editing (planned), 03b pins (planned, reviewed), 03c–03e.
  - 04+: remove the cell-editing bullet. The reference bullet keeps only the back button, open in new tab, find references and the empty-records context menu. The menu bullet notes that Save/SaveAs/CloseFile are done in 03a.
- **`02-react-e2e.md`**: fix the cross-references: 03b raw/FRT → 03c, 03c jump → 03d, 03d reference editor → 03a, "edit + save (cell-editing step)" → 03a, and bulk-edit/empty-records cell editing → 03a.
- **`03b-table-pins.md`**: header "03b — Table pinning". 03a and 03b only touch different parts of `FieldEditorActionBar` / `TableEditor`, so neither depends on the other.
- **Memory**: update `react-toolchain-plan.md` to say 02 is committed, 03a is cell editing (planned) and 03b is pins.

## Implementation notes (2026-10-25)
- **Blob e2e:** a sweep of every table in `CAREER-M22TEST` found no `valueInThirdTable` column, so there is no `react/blob-editor.spec.js`. The blob editor is covered by `BlobEditorModal.test.tsx` only.
- **Ctrl+S:** Playwright's synthesized keys don't trigger Electron menu accelerators. `save.spec.js` checks that `Save` is enabled and clicks the menu item. The accelerator sends the same `save-file` event.
- **`cells()` returns every property on every call** (className, readOnly, editor, renderer, errorMessage). Handsontable keeps what an earlier call set, so this replaces v4's clearing of the empty class on un-emptied rows. `planWriteResult` still reports `unemptiedRows`, but the hook doesn't need them.
- **Stale tooltips:** a `beforeRenderer` hook removes `title` from every cell, because Handsontable reuses `td`s while scrolling and only error cells set one.
- **Reverts** go through `setDataAtRowProp(..., 'cell-write-revert')`, so no field-name → column lookup is needed.
- If the user switches tables while a write is in flight, the response is dropped (v4 skipped only the other table's rows). The new table is read fresh from main anyway.
- **Following a reference** to the same table is handled in `FieldEditorView` (`grid.selectCell`). Another table goes through `TableEditor.onSelectTable(table, selection)`, which sets `pendingSelection` in the same batch as the table data, so the grid renders once.
- **Grid model:** `Grid.selectCellAt` clicks the cell corner (so it doesn't follow a link), presses Ctrl+Home (the first rendered row isn't row 0 once the grid has scrolled), then sends the arrow keys without awaiting each one, as v4's `HotComponent` does. Selectors skip `.listbox` (the dropdown editor's nested grid).
- `react/smoke.spec.js` needed no change.
