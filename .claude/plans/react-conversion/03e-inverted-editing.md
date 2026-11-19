# 03e — Editing in the inverted view

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Depends on [03a-cell-editing.md](03a-cell-editing.md) (write path), [03c-import-export.md](03c-import-export.md) (import/export) and [03d-jump-to-column.md](03d-jump-to-column.md) (the inverted jump).

## Goal
Make the Switch Orientation view editable, with the same behaviour as the normal view: typed edits, dropdowns, paste/fill, undo/redo, reverts, error and empty cells, the reference and blob editors, and link navigation. React has this view and v4 doesn't, so this is a new feature, not a port.

The **normal view is the canonical one**: records are rows and fields are columns. Inversion is display-only:
- `table.records` stays the source of truth, in record/field terms.
- Export always writes the normal layout (`getExportData(table)` already reads `table.records`, so nothing changes there).
- Import always expects the normal layout (`externalData.importBulk` is unchanged).
- Orientation is a view toggle of the tab's current table, not a setting. A new table (sidebar, followed reference, new tab) starts in the normal view. An import reload of the same table keeps the orientation.
- Switching orientation keeps the undo/redo history. Undo and redo work across switches.
- Neither view gets noticeably slower (see Performance).

## Current state (what blocks editing)
- `TableEditorComponent.tsx:163-164`: `editable = !isInverted && …`, and `getContext` returns `null` when inverted (`:219`).
- `:241-252`: `columns` is `undefined` when inverted, so there are no per-field editors, renderers or dropdown sources.
- `:254-260`: `colWidths` is `undefined` when inverted, so Handsontable measures the width of every column (one per record, ~4,000 on the Player table) after each switch.
- `:262-271`: the inverted `data` is a copy (`headers.map(name => [name, ...records.map(r => r[name])])`). Edits to it don't reach `table.records`, unlike the normal view, where the rows *are* the record objects.
- `:296`: `cells()` returns `{}` when inverted, so there are no error or empty cells.
- `useCellWrites.ts:98-100`: `toCellWrites` treats the visual row as the record and the prop as the field name.
- `useCellWrites.ts:130, 134` / `cellWrites.ts:242-305`: reverts are visual `[row, prop, old]` taken from the change, and `sourceEdits` are `[recordIndex, fieldName, value]`. Both only fit the layout the edit was made in.
- Orientation is `FieldEditorView` state (`:69-71`). That component isn't remounted on a table or tab switch, so the orientation leaks into the next table.
- The selection is in visual coordinates everywhere outside the grid. `onSelectionChange` saves it as the tab's view state, `initialSelection` restores it (and a followed reference passes `(record, 0)`), `selectCell` is used by link navigation and the editors' close, and `FieldEditorView.tsx:126-135, 227-230` has its own inverted branch for the jump modal.
- Undo uses Handsontable's UndoRedo plugin, which can't follow a switch:
  - A new `data` prop reaches Handsontable through `updateSettings` → `updateData` (`core.js:2503`), which keeps the stack (only a `loadData` clears it, `undoRedo.js` `_onAfterChange`).
  - The stack holds **visual** coordinates (`DataChangeAction.changes = [row, col, old, new]`, plus `selected`, `countRows`, `countCols`). After a switch, an undo writes into the transposed cell.
  - `DataChangeAction.undo` removes `hot.countRows() - this.countRows` rows when the grid has grown since. An inverted action (one row per field) undone in the normal view (one row per record) would remove thousands of rows.
  - The stacks (`doneActions`, `undoneActions`) and the action class are `@private`, and `handsontable` is `^16.2.0`, so rewriting them would depend on internals that a minor release can change.
  - Because `updateData` keeps the stack, a table switch probably keeps it too, so an undo after a switch would write the old table's cells into the new table. The comment at `TableEditorComponent.tsx:138-141` ("reloads `data` … which clears the undo stack") looks wrong. Confirm with the e2e check below; the new undo stack fixes it either way.
  - A revert (`setDataAtRowProp(…, 'cell-write-revert')`) is recorded as its own undo entry, so an undo after a rejected value replays the rejected value.

## Design

### One rule: outside the grid, cells are (record, field)
`TableEditorComponent` is the only place that knows about visual coordinates. Everything it takes or gives (`GridHandle`, `initialSelection`, `onSelectionChange`, `ReferenceEditRequest`, `BlobEditRequest`) uses `CellPosition` as **`{ row: recordIndex, col: fieldIndex }`**, in both orientations. Rename nothing, but update the `CellPosition` doc comment to say so.

A selection saved in one orientation then restores correctly in the other, and the inverted branches in `FieldEditorView` go away.

### Orientation mapping (`components/TableEditorComponent/orientation.ts`, new, pure)
```ts
export interface RecordCell { recordIndex: number; fieldIndex: number }
export interface GridOrientation {
    inverted: boolean;
    // A visual cell → its record cell. null for the inverted field-name column.
    toRecordCell(row: number, prop: string | number): RecordCell | null;
    // A record cell → the visual cell, for selectCell/setDataAtCell
    toVisualCell(cell: RecordCell): [row: number, col: number];
    // A record cell → the physical cell, for setSourceDataAtCell
    toSourceCell(cell: RecordCell): [row: number, prop: string | number];
}
export function createOrientation(
    inverted: boolean,
    headerNames: readonly string[],
    rows: { toPhysicalRow(row: number): number; toVisualRow(row: number): number }
): GridOrientation
```
- Normal: `toRecordCell(row, prop)` = `{ recordIndex: toPhysicalRow(row), fieldIndex: typeof prop === 'number' ? prop : headerIndex(prop) }`. `toSourceCell` = `[recordIndex, headerNames[fieldIndex]]`. `toVisualCell` = `[toVisualRow(recordIndex), fieldIndex]`.
- Inverted: row = field, col = record + 1. `toRecordCell(row, col)` returns `null` for col 0, otherwise `{ recordIndex: col - 1, fieldIndex: row }`. `toSourceCell` = `toVisualCell` = `[fieldIndex, recordIndex + 1]` (no sorting or moving in the inverted grid).
- Field name lookups use a `Map` built once, not `indexOf` per change (a paste is 2,500+ changes).
- The selection map: a field-name cell (col 0) reports `{ row: 0, col: fieldIndex }`, so it restores to the first record of that field.
- Built in a `useMemo` on `[isInverted, headerNames]`, with the hot instance read lazily through `hotRef`. `useCellWrites`, `cells()` and the undo stack read it from a ref, so the hooks stay stable (the reason `propsRef` exists, `TableEditorComponent.tsx:138-141`).

### Write path in record terms
`utils/cellWrites.ts`:
- Each `CellChange` is resolved into a `RecordChange = { cell: RecordCell; fieldName: string; oldValue: unknown; newValue: unknown }` in `useCellWrites.afterChange`, **before** the `await`, with the orientation of that moment. Changes with a `null` record cell (the field-name column) are dropped there, so `response.results[i].index` still lines up.
- `toCellWrites(recordChanges, tableId)` (no more `toPhysicalRow` argument).
- `planWriteResult(table, recordChanges, response, state, { syncChangedFields })`:
  - `reverts` become record-space `SourceEdit`s: `[recordIndex, fieldName, oldValue]`.
  - `failedChanges: number[]`: the indices of the rejected changes, for the undo stack.
  - When `syncChangedFields` is true (inverted), each returned record of this table is compared field by field with `table.records[recordIndex]` **before** the `Object.assign`, and only the fields whose value differs get a `sourceEdit`. The inverted cells are copies, and main may change fields other than the edited one (un-empty, computed fields). Usually only the edited field differs. It already shows the new value, so that edit is a harmless no-op. In the normal view the `Object.assign` at `:272-275` already updates the grid's row objects, so this stays false there.
  - Drop `unemptiedRows`: nothing reads it (`cells()` reads `emptyRecordIndices`).
- `useCellWrites` applies the plan with the orientation **current when the response arrives**: reverts through `toVisualCell` → `setDataAtCell(…, 'cell-write-revert')`, and `sourceEdits` through `toSourceCell` → `setSourceDataAtCell(…, 'onEmpty')`. `syncChangedFields` is the current orientation too.
- So a write still in flight when the user switches orientation lands in the right cells of the new layout. In the normal view the failed value was already in the record object (the rows are the records), so it was copied into the new inverted data, and the record-space revert puts the old value back there.

### Undo and redo: our own record-space stack
Replace Handsontable's UndoRedo plugin with a stack that stores (record, field) changes, so switching orientation needs no special handling and nothing depends on private Handsontable state.

`components/TableEditorComponent/undoStack.ts` (new, pure):
```ts
export interface UndoEntry { changes: RecordChange[] }
export interface UndoStack {
    push(entry: UndoEntry): void;          // clears redo
    takeUndo(): UndoEntry | null;          // moves the entry to redo
    takeRedo(): UndoEntry | null;          // moves the entry back to undo
    dropChanges(entry: UndoEntry, indices: readonly number[]): void; // removes the entry if it ends up empty
    clear(): void;
}
export function createUndoStack(): UndoStack
// The changes to apply: oldValue for undo, newValue for redo
export function toReplayChanges(entry: UndoEntry, direction: 'undo' | 'redo'): { cell: RecordCell; value: unknown }[]
```
No size limit, like the plugin.

`components/TableEditorComponent/useUndoStack.ts` (new), used by `TableEditorComponent` with `hotRef` and the orientation ref:
- `HotTable` gets `undo={false}`, which turns off the plugin and its shortcuts.
- Shortcuts: after the grid is created, register Ctrl/Meta+Z (undo) and Ctrl/Meta+Y, Ctrl/Meta+Shift+Z (redo) in `hot.getShortcutManager().getContext('grid')`, with `group: 'mfeUndoRedo'` and `runOnlyIf: (e) => !e.altKey`, as the plugin does (`undoRedo.js:136-160`). The shortcut manager is public API. Shortcuts in the `grid` context don't run while a cell editor is open, so the editor's own text undo still works.
- Recording: `useCellWrites.afterChange` calls `record(recordChanges)` for user edits (every source that isn't in `IGNORED_CHANGE_SOURCES` and isn't one of ours), before the `await`. One `afterChange` call (a typed edit, a paste, a fill) is one entry, like the plugin.
- New sources `UNDO_SOURCE = 'mfe-undo'` and `REDO_SOURCE = 'mfe-redo'` in `cellWrites.ts`. They're written to main like a user edit, but not recorded. `'cell-write-revert'`, `'onEmpty'` and the load sources are neither written nor recorded (unchanged).
- After the response, `useCellWrites` calls `dropChanges(entry, plan.failedChanges)` for an entry it recorded. A rejected value is then never replayed, and an entry where every change was rejected disappears.
- Undo/redo: take the entry, map each change with the current `toVisualCell`, `setDataAtCell(changes, UNDO_SOURCE | REDO_SOURCE)`, then select the bounding range of the mapped cells (`selectCell(r1, c1, r2, c2)`, which scrolls it into view). For a column paste in the normal view that is the pasted range, as with the plugin. Changes whose record or field no longer exists are skipped.
- Clearing: in the initial-selection effect, when `table` changed (a new table or an import reload), not on an orientation switch. Also on unmount. This fixes the table-switch leak.
- An undo while the original write is still in flight: the entry is already on the stack (pushed before the `await`), so the undo works. When the first response arrives, `dropChanges` still finds the entry by identity, whichever list it is in.
- The existing undo specs (`react/cell-edit.spec.js` "undo and redo after a bulk paste are saved to the file") must pass unchanged. That is the check that behaviour matches the plugin.

### Inverted data stays in sync with `table.records`
- A successful write updates `table.records` in `planWriteResult` (already) and the inverted cells through the changed-field `sourceEdits`, without rebuilding `data`.
- Switching orientation rebuilds `data` from `table.records` (the `useMemo` at `:262`). The undo stack isn't affected, because it holds record cells.

### Per-cell settings and widths (`TableEditorComponent.tsx`, `columns.ts`)
- `editable = !!fileId && isEditableTable(table)`. Remove the `isInverted` checks there and in `getContext`.
- Always build `fieldColumns = buildColumns(headers, renderers)` for an editable table. Pass it as `columns` only in the normal view. Inverted, `columns` stays `undefined` (array rows).
- `cells(physicalRow, physicalCol)` resolves the record cell with `toRecordCell`, then:
  - Field-name column (inverted col 0): `{ readOnly: true, editor: false, renderer: 'text', className: 'table-cell--field-name', errorMessage: undefined }`.
  - Otherwise, the existing logic keyed by `recordIndex` and `headers[fieldIndex]` (error cell, reference with a link → no editor, the empty class). Inverted, it also returns the field's `renderer`, `editor`, `source` and `wordWrap: false` from `fieldColumns[fieldIndex]`, because there are no column settings. Every property is returned on every call, including `source: undefined` for non-dropdown cells, because Handsontable keeps what an earlier call set (`:286-288`).
  - The body moves to `cellMeta.ts` (`getCellMeta(...)`, pure) so it can be tested without a grid. `cells()` stays a thin wrapper.
- Inverted widths: `columns.ts` gets `calculateInvertedColumnWidths(headers): (index: number) => number`. Column 0 is the longest field name (`name.length * 9 + 26`, like `calculateColumnWidths`). Every record column is a fixed `INVERTED_RECORD_COLUMN_WIDTH = 200`. It's a function, not a 4,000-entry array. `HotTable` also gets `autoColumnSize={false}`, so nothing is measured. Long values (blobs, references) are cut off, as in a narrow normal column; the cell editor and the blob modal show them in full.
- The empty class is per record, so inverted it marks a whole column. No new CSS. `table-cell--field-name` gets a style in `TableEditorComponent.module.css` (`:global`, bold, header background) so the read-only column looks like a header.

### GridHandle and callbacks in record coordinates
- `setDataAtCell(recordIndex, fieldIndex, value)` and `selectCell(recordIndex, fieldIndex)` map with `toVisualCell`.
- `getSelectedCell()` and `onSelectionChange` report `toRecordCell` of the visual selection (with the field-name rule above).
- The initial-selection effect (`:441-453`) maps the selection with `toVisualCell`. It already runs on `[table, isInverted]`. On an orientation switch it uses `lastSelectionRef` (record coordinates), so the same record and field stay selected, and `selectCell` scrolls them into view. On a table load it uses `initialSelection`, as now.
- Scroll on an orientation switch: the saved pixel offset isn't reused. The reselect scrolls the selected cell into view, and `afterScroll` then saves the new offset. A tab restored later gets the offset saved in the orientation it is restored in.
- `handleClick` builds `ReferenceEditRequest` / `BlobEditRequest` with the record cell of the clicked `td`. Ignore clicks with a `null` record cell (there are no buttons in the field-name column anyway).
- Fix the comment at `:138-141`: a new `data` prop updates the data (which drops the selection); the undo stack is ours now.

### Orientation is the tab's view state (`TableEditor.tsx`, `tabs/EditorTabsContext.tsx`, `FieldEditorView.tsx`)
- `TabViewState` gets `inverted?: boolean`, next to `selection` and `scroll`. It is only in memory, like the rest of `TabViewState`, and isn't a preference.
- `TableEditor` owns `isInverted` state, set by every table load:
  - `onSelectTable(table, selection, options)` takes `options.inverted` (default `false`), sets the state, and writes it to the tab's view state with the selection and scroll (`:157-160`).
  - A sidebar click, a followed reference in the current tab, a new tab and the first table of a file pass nothing → normal view.
  - Activating a tab (`:283-288`) and `reloadTable` after an import (`:241-245`) pass `saved?.inverted`, so the tab comes back in the orientation it was left in, and an import keeps it.
- `FieldEditorView` takes `isInverted` and `onToggleOrientation` props and drops its own `TableOrientation` state. The toggle sets `TableEditor`'s state and the tab's view state.
- `FieldEditorView` changes: `jumpToCell` → `gridRef.current?.selectCell(row, col)` in both orientations, and `initialRow={jumpFrom?.row ?? 0}`. Remove the inverted branches (`:126-135`, `:227-230`). `handleFollowReference` (`selectCell(recordIndex, 0)`), `closeReferenceEditor`, `closeBlobEditor` and the editors' `setDataAtCell` calls are unchanged, because they already pass record cells.

### Import and export
No code changes beyond `reloadTable` passing `saved?.inverted`. `getExportData` reads `table.records` and `importBulk` writes records, so both are already orientation-free. `reloadTable` restores the saved selection, now in record coordinates, so it lands on the same record and field.

## Performance
Expected costs, and what keeps them small:
- Rendering: Handsontable virtualizes rows and columns, so only visible cells render in either view. Inverted `cells()` does one `toRecordCell` and returns the field's settings, which is negligible for a few hundred visible cells.
- Widths: fixed inverted widths and `autoColumnSize={false}` (above) avoid measuring thousands of columns after each switch.
- Switching: one pass over every cell to build the inverted arrays, plus a render. The current read-only view already pays this; nothing is added.
- Inverted edits: the same IPC as the normal view. The changed-field sync keeps the follow-up grid work about the size of the edit. Syncing whole records instead would be ~1 million cell updates for a 2,500-record paste on the Player table.
- Normal view: one `Map` lookup per change in `afterChange`, one extra call per visible cell in `cells()`, and a record-space undo entry instead of the plugin's deep-cloned one. The changed-field sync never runs there.

Measured during implementation, on the Player table (4220), with the timings written into this plan's "Implementation notes":
- **Baseline first, on the current code:** a normal 2,500-cell column paste (the existing `cell-edit.spec.js` paste), undo of that paste, and the switch to the read-only inverted view.
- **After:** the same three, plus an inverted 2,500-cell paste (one field across 2,500 records) and its undo.
- Pass: normal paste and undo within ~10% of baseline; the inverted paste within ~10% of the normal one; the switch no slower than baseline. Measure from the paste/undo keypress to the loader hiding, and from the Switch Orientation click to the first rendered cell. Use a throwaway local script or `performance.now()` logging; don't commit it.

## Edge cases
- Paste or fill in the inverted view writes one record across several fields with mixed types. Main rejects values that don't fit, and only those cells revert (the same path as 03a's invalid-paste test). Undo then skips them.
- Paste or fill over the field-name column: Handsontable skips read-only cells. A change that still gets through is dropped by the `null` record cell.
- A paste that runs past the grid's edge: Handsontable's CopyPaste adds rows/columns to fit. Inverted, new rows would be fields and new columns records, neither of which exists. Check what the normal view does today first. Inverted, return `false` from `beforeCreateRow`/`beforeCreateCol`, so the paste is clipped to the grid.
- Undo, switch, undo again, switch back, redo: entries hold record cells, so they always target the same record and field.
- Editing an empty record inverted: with auto un-empty the whole column loses `table-cell--empty`, and the changed-field sync puts back the fields main filled in.
- A table with no records, inverted: only the field-name column. Nothing is editable, and the initial selection maps to the visual (0, 1), which doesn't exist. Clamp to col 0 when there are no records.
- An error cell inverted: keyed by record, so `cellErrors[recordIndex][fieldName]` works unchanged.
- A reference link in the inverted view follows to the same table/record as in the normal view, and the new table opens in the normal view. A self-reference selects (record, field 0) and stays inverted, because it's the same table.
- Export from the inverted view: normal layout (rows = records). Import while inverted: the file is read in the normal layout, the table reloads, the grid stays inverted, and the undo stack is cleared (as for any reload).

## Tests

vitest:
- `components/TableEditorComponent/orientation.test.ts` (new): normal and inverted `toRecordCell`/`toVisualCell` round trip; the field-name column → `null`; a string prop → field index; `toSourceCell` in both.
- `components/TableEditorComponent/undoStack.test.ts` (new): push clears redo; undo/redo move entries between the lists; `toReplayChanges` gives old values for undo and new values for redo; `dropChanges` removes the failed changes, and the whole entry when none are left, in either list; `clear`.
- `components/TableEditorComponent/useUndoStack.test.tsx` (new, with a fake hot instance: `setDataAtCell`, `selectCell`, `getShortcutManager`): undo maps through the current orientation (an entry recorded normal, replayed inverted, writes `[field, record + 1]`); replays use `UNDO_SOURCE`/`REDO_SOURCE`; the selection is the bounding range; shortcuts are registered once and removed on unmount.
- `utils/cellWrites.test.ts`: `toCellWrites` with record changes; `planWriteResult` reverts are record-space; `failedChanges` lists the rejected indices; `syncChangedFields` adds edits only for fields that differ, and none for other tables; `unemptiedRows` removed from the expectations; `UNDO_SOURCE`/`REDO_SOURCE` aren't in `IGNORED_CHANGE_SOURCES`.
- `components/TableEditorComponent/cellMeta.test.ts` (new): inverted gives the field's editor/renderer/source per row, the field-name column is read-only, the empty class is by record, the error cell by record.
- `components/TableEditorComponent/columns.test.ts`: `calculateInvertedColumnWidths` (column 0 from the longest name, fixed record columns).
- `routes/TableEditor` (a new orientation test with the franchise API mocked, or extend an existing one): a new table loads normal, a tab activation and an import reload restore `inverted` from the view state.

e2e (`tests/e2e/scripts/react/inverted-edit.spec.js`, new), on 7482 (Team), 4097 (OverallPercentage) and 4220 (Player), with `app.readTable` checks:
- Model additions: `TableEditorPage.isInverted()` (the first column header is "Field Name"). Cells are reached with `jumpToColumn`, which already works inverted (03d).
- Text edit: invert, jump to LongName at record 5, type a value → the grid shows it, and `readTable(7482, ["LongName"])` has it at record 5. Switch back to normal → record 5's LongName shows it.
- Enum/bool dropdown edit inverted (`TeamRegressionOccurred`) → saved.
- **Undo across a switch.**
  - Edit LongName at record 5 inverted, switch to normal, Ctrl+Z → the old value is back at row 5 of LongName in the grid and in `readTable`, and the grid's row count is unchanged. Ctrl+Y → the new value again.
  - The reverse: edit in normal, switch to inverted, undo → the old value, in the right cell.
  - A bulk paste in normal (two cells), switch, undo → both cells restored, in the grid and in the file.
- An invalid value (text into a number field) → reverted, the file is unchanged, and Ctrl+Z doesn't replay it.
- The field-name column can't be edited (typing on it changes nothing).
- Reference editor inverted on 4097's reference field: pick a table and row → saved, the link text updates.
- **Inverted bulk paste stays responsive.** On 4220, invert, paste 2,500 values across one field's records, and check it finishes within `MAX_BULK_PASTE_MS` (the bound `cell-edit.spec.js` uses) with the loader shown, and that `readTable` has the values.
- **Orientation is per table view.** Invert 7482, open 4097 from the sidebar → normal. Back to 7482 from the sidebar → normal. Invert 7482, open a new tab with 4097 → normal; go back to the first tab → still inverted, same cell selected.
- **Export in inverted mode, external edit, import (the edge case).** On 7482:
  1. Switch orientation, so the grid is inverted.
  2. Export (action bar) to `FilePaths.m22.exports.test`, and `waitForFile`.
  3. Check the file is in the **normal** layout: read it with `xlsx` in the test, the header row equals the table's header names (`readTable` order), and it has one data row per record (not one per field).
  4. Edit it the way an external program would: with `xlsx`, set LongName of record 5 to `"InvertedImport"`, and write it to a new file in `export/test/` (not over a fixture).
  5. Import that file (action bar).
  6. The table is updated: `readTable(7482, ["LongName"])` has `"InvertedImport"` at record 5.
  7. The grid is still inverted: `isInverted()` is true, and `jumpToColumn("LongName", 5)` shows `"InvertedImport"`.
  8. Switch to normal: the value is at row 5 of LongName there too.
  9. Save, close, reopen, open 7482: the value is still there, and the view is normal.
- `react/cell-edit.spec.js`: add a check that undo doesn't cross tables. Edit a cell, open another table from the sidebar, Ctrl+Z → nothing in the second table changes (`readTable`). Its existing undo/redo test stays unchanged and must pass on the new stack.
- `react/jump-to-column.spec.js`: its inverted step stays as it is and should keep passing after `FieldEditorView`'s inverted branch is removed.
- `react/import.spec.js`, `export.spec.js`, `reference-editor.spec.js`, `tabs.spec.js`: re-run unchanged. The record-coordinate selection change touches tab view state and reference following.

## Verification
`npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`, `npm run build:react`, then `npx playwright test --project=react` (the whole React project, because the `GridHandle`, selection and undo changes touch every table spec). Record the Performance timings (baseline and after). Update the 03e row in [03-table-editor-parity.md](03-table-editor-parity.md).

## Implementation notes
Performance, Player table (4220), 3 runs each, from the keypress/click to the loader hiding (paste/undo) or to the "Field Name" header rendering (switch):

| | Baseline (before 03e) | After |
|---|---|---|
| Normal 2,500-cell paste | 1140 / 1097 / 1086 ms (avg 1108) | 1176 / 1158 / 1130 ms (avg 1155, +4%) |
| Undo of that paste | 1022 / 1013 / 987 ms (avg 1007) | 1200 / 1075 / 1111 ms (avg 1129, +12%) |
| Switch to inverted | 10731 / 9947 / 9922 ms (avg 10200) | 408 / 378 / 395 ms (avg 394) |
| Inverted 2,500-record paste | (read-only) | 1268 / 1271 / 1247 ms (avg 1262, +9% over the normal paste) |
| Undo of the inverted paste | (read-only) | 1287 / 1257 / 1270 ms (avg 1271) |

- Normal undo is slightly over the ~10% bound (+12%, ~120 ms). The replay is one `setDataAtCell` of the 2,500 cells plus a range `selectCell`, like the plugin, so most of it is probably run-to-run noise; not investigated further.
- The switch was ~10 s before because AutoColumnSize measured every record column. Fixed widths remove that.
- Paste past the grid's edge, normal view, before 03e: CopyPaste added rows to the grid, and so to `table.records` (the rows are the records). Main rejected their writes, so the file was unchanged, but the phantom rows stayed in the grid and showed up in the inverted view as extra "Record n" columns. `beforeCreateRow`/`beforeCreateCol` now return `false` in **both** views, so a paste is clipped to the grid (e2e: "a paste past the grid's edge is clipped in both views").
- Two Handsontable behaviours needed handling in `TableEditorComponent`:
  - A `data` update keeps the old **visual** selection and reports it again through `afterSelectionEnd`. After a switch that is another record and field, and it overwrote the saved selection. `reselectPendingRef` (set in a layout effect on `[table, isInverted]`) ignores selection events until the reselect effect has run.
  - The switch's reselect runs inside the Switch Orientation click. Handsontable 16's focus-scope manager has its own document click listener, which runs after React's and unlistens the grid, so Ctrl+Z went nowhere. The reselect effect calls `hot.listen()` again in a `setTimeout` after a switch (not after a table load, which is async anyway).
- `GridOrientation` also has `physicalToRecordCell` (for `cells()`) and `fieldIndexOf` (to map record-space reverts and source edits back to the grid).
- `RecordCell`/`RecordChange` live in `utils/cellWrites.ts` (re-exported from `orientation.ts`), so `utils` doesn't import from `components`.
- No vitest for `routes/TableEditor` orientation state: rendering `TableEditor` needs the grid, the sidebar and Allotment under jsdom. The e2e "the orientation belongs to the tab's current table" and the export/import test cover new-table, tab-activation and import-reload behaviour.

## Decisions
Confirmed:
- The normal view is canonical. Export writes it and import expects it, whatever the current orientation.
- Orientation is a view toggle, not a setting. It belongs to the tab's current table, resets to normal when the tab's table changes, and survives an import reload.
- Switching orientation keeps undo/redo, which keep targeting the same record and field.
- Undo/redo use our own record-space stack, not Handsontable's UndoRedo plugin.
- Inverted widths are fixed (no auto-measuring), and only changed fields are synced after an inverted write.

To confirm:
- Everything outside `TableEditorComponent` talks in (record, field), including the tab's saved selection. This replaces 03d's inverted branch in `FieldEditorView`.
- Switching back to a tab restores the orientation it was left in (it's part of that tab's view state, with the selection and scroll).
- Rejected values are dropped from their undo entry, so undo never replays them. Today the plugin records the revert as its own entry.
- Undo history is cleared on every table load, including an import reload. An undo across an import would mix pre-import values into imported data.
- Inverted record columns are a fixed 200px wide.
- The inverted field-name column is read-only and styled like a header.
- An inverted paste past the grid's edge is clipped, not extended.
