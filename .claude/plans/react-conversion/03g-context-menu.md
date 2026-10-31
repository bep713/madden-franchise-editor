# 03g — Grid context menu

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Writes data (empty records, the next-record pointer). Touches `TableEditorComponent.tsx`, `FieldEditorView.tsx`, `utils/cellWrites.ts`, `TableEditor.tsx` (cleanup only), the preload types, and one new main-process handler.

## Goal
Port v4's grid context menu (`renderer/js/services/table-editor/contextMenuService.js`, wired in `TableEditorView.js:55`) and its References modal (`renderer/js/services/referenceViewerService.js`, markup `renderer/table-editor.html:39-53`). React has no context menu today: `registerAllModules()` registers the plugin, but `contextMenu` is never set.

## v4 behaviour (what is being ported)
Handsontable's `contextMenu` with only these items (no built-in ones), in this order:

| Key | Label | Disabled when | Does |
|---|---|---|---|
| `find_references` | Find references to this record... | the last selection spans more than one row (`getSelectedLast()[0] !== [2]`) | `franchiseAPI.getReferencesToRecord(fileId, tableId, row)` → References modal |
| `open_new_tab` | Open this reference in a new tab | not a single cell, or the cell has no `.edit-button` (not a reference cell) | dispatches a middle-click `auxclick` on the cell's `<a>` → background tab |
| `empty_row` | Set selected record(s) as empty | no selection; a row < 0 (column header); `header.record1Size < 4`; every row in the range already empty | loader; `franchiseAPI.setTableRecordsEmpty(fileId, tableId, nonEmptyRows)`; on `error` only `console.error`; else `syncEmptyRecords(result.emptyRecords)` (writes the first-4-byte fields of every empty row with source `onEmpty`, re-renders) |
| `advanced` → `advanced:setNextRecordToUse` | Advanced... → Set as next empty record to use | more than one row | calls `selectedTable.setNextRecordToUse(row, true)`, which never exists on the serialized table, so it only logs "setNextRecordToUse is not available on serialized tables yet." Broken since the IPC move. |

- The range is mapped with `toPhysicalRow` at both ends, then min/max.
- Right-click outside the selection selects the clicked cell first (Handsontable default).

References modal (`referenceViewerService.showReferenceViewer`):
- Title "References", an "X" close, Esc closes (`_modalCloseListener`).
- Header: "The following tables reference " + `(<tableId>) <name> - Record #<recordIndex>:`.
- One row per result, text `(<tableId>) <name>`. Main returns **one result per referencing record** (`FranchiseFileManager.getReferencesToRecord`, manual scan, `{tableId, name, recordIndex, fieldName}`; the library has no `getReferencesToRecord`), so a table that references the record from several rows is listed several times with identical text. **Correction (implementation):** the library does have `FranchiseFile.getReferencesToRecord`, and main preferred it. It returns candidate tables only (schema can reference the type and the data holds the reference bytes), with no record index, so v4 listed one row per candidate table and the manual scan never ran. The scan was also broken: `offsetTable` is empty before `readRecords()`, and the library's reference data uses `rowNumber`, not `recordIndex`. Main now uses the library call as a pre-filter and scans those tables per record, so v4 also lists per record now. Covered by `tests/unit/franchiseFileManager.test.js`. (The index row for 03g says "one row per referencing table"; that is wrong and is corrected below.)
- Click closes the modal and opens the table at record 0 in the current tab (`_onReferenceClicked` → `tableSelector.setValue`); ctrl+click or middle-click opens it in a new tab.
- `result.error` → "Failed to load references: <error>". Empty → "No references."
- The modal only appears after the scan finishes; there is no loading state.

e2e: `empty-records.spec.js` (set empty twice, chain pointers, un-empty through the reference editor, auto-unempty on and off) and `bulk-edit.spec.js` "the context menu can set a record as empty". Nothing tests Find references, Open in new tab, or Advanced.

## Design

### Main: Set as next empty record (`main/services/FranchiseFileManager.js`, `preload/franchisePreload.js`)
The library has `FranchiseFileTable.setNextRecordToUse(index, resetEmptyRecordMap)`. It writes `header.nextRecordToUse` and, with `true`, re-parses the empty-record chain from the new head (`_parseEmptyRecords`). Pointing the head at a non-empty record makes the parser read that record's first 4 bytes as a pointer, which can throw or loop. So main only allows an already-empty record.
- `async setTableNextRecordToUse(fileId, tableId, recordIndex)`, next to `setTableRecordsEmpty`:
  - Same file/table checks; `await table.readRecords()`.
  - Throws `Record not found: n` when out of range, `Record n is not empty` when `!table.records[n].isEmpty`.
  - `table.setNextRecordToUse(n, true)`.
  - Returns `{ nextRecordToUse: table.header.nextRecordToUse, ...this._serializeEmptyState(table) }`.
- IPC `franchise:set-table-next-record-to-use` in `registerIpcHandlers`, shaped like `franchise:set-table-records-empty`: `{ success: true, ... }` or `{ error }`. No `main.js` change (same module).
- Preload: `setTableNextRecordToUse: (fileId, tableId, recordIndex)` on `franchiseAPI`.
- Records before the new head drop out of the chain, so they stop counting as empty. That is what the item means; the e2e checks it.
- The table's `change` event already reaches `franchise:table-changed` / save-on-change (`FranchiseFileManager.js:342`), as for `empty()`.

### Types (`src/shared/types/franchise.ts`, `src/renderer/src/preload.d.ts`)
```ts
// getReferencesToRecord data[]
export interface RecordReference { tableId: number; name: string; recordIndex: number; fieldName?: string }
export type GetReferencesResult = { data: RecordReference[] } | ErrorResult;

// setTableRecordsEmpty / setTableNextRecordToUse
export type EmptyRecordsState = Omit<EmptyState, 'tableId'>;
export type SetRecordsEmptyResult = ({ success: true; affectedCount: number } & EmptyRecordsState) | ErrorResult;
export type SetNextRecordResult = ({ success: true; nextRecordToUse: number } & EmptyRecordsState) | ErrorResult;
```
`preload.d.ts` declares `getReferencesToRecord`, `setTableRecordsEmpty`, `setTableNextRecordToUse`.

### Empty-state sync (`src/renderer/src/utils/cellWrites.ts`)
- Pull the `emptyState` branch of `planWriteResult` (lines 180-194) into:
  ```ts
  // Mutates table and state; returns the edits for setSourceDataAtCell
  export function applyEmptyState(table: WritableTable, emptyState: EmptyRecordsState, state: WriteState): SourceEdit[]
  ```
  `planWriteResult` calls it. Besides what the branch does today, it also:
  - sets `table.recordMeta[i].isEmpty` for every index that entered or left the set;
  - `Object.assign`s each empty record's first-4-byte fields into `table.records[index]`. Without this the inverted view, whose cells are copies, leaves `table.records` stale, and switching orientation shows the old pointers. That also fixes the same gap for un-empty writes made in the inverted view.
- Rows that leave the set need no cell-meta clearing: `cells()` recomputes `className` from `writeState` on every render (`cellMeta.ts:80`).

### Context-menu logic (`components/TableEditorComponent/contextMenu.ts`, new, pure)
```ts
export type SelectionRange = [row1: number, col1: number, row2: number, col2: number];

// Records covered by the range: normal view rows (through toPhysicalRow, both ends, then min/max, like v4),
// inverted view columns - 1. null when it touches a header or the inverted field-name column.
export function selectedRecordRange(range: SelectionRange | undefined, orientation: GridOrientation): { start: number; end: number } | null
// The one record the range covers, else null
export function singleSelectedRecord(range, orientation): number | null
// Indices in the range that aren't empty yet
export function recordsToEmpty(range, orientation, emptyRecordIndices: ReadonlySet<number>): number[]
// header.record1Size < 4 can't hold the empty pointer
export function canEmptyRecords(table: Pick<TableData, 'header'>): boolean

export interface ContextMenuActions {
    findReferences: { disabled(): boolean; run(): void };
    openReferenceInNewTab: { disabled(): boolean; run(): void };
    setRecordsEmpty: { disabled(): boolean; run(): void };
    setNextRecordToUse: { disabled(): boolean; run(): void };
}
// Handsontable contextMenu settings with v4's keys, labels and order
export function buildContextMenu(actions: ContextMenuActions): Handsontable.plugins.ContextMenu.Settings
```
- Only the last selection layer counts (`getSelectedLast()`), as in v4.
- `selectedRecordRange` needs a row mapper for the normal view. `GridOrientation` gets one method: `toRecordIndex(row: number, col: number): number | null`, null for header coordinates and the inverted column 0. Then the helpers don't need to know the orientation's internals.
- Inverted view: a record is a column. Find references needs a single record column; a column-header click (rows -1..n, one column) is one whole record, so it counts. The field-name column disables every item.

### Grid (`TableEditorComponent.tsx`)
- New props (stable, read through `propsRef` like the others):
  ```ts
  // Find references to this record...
  onFindReferences?: (recordIndex: number) => void;
  ```
  Open in new tab reuses `onFollowReference(tableId, recordIndex, 'background', cell)`, which is what a middle-click on the link does (`handleAuxClick`), so self-references also get their own tab.
- `contextMenu` setting: `useMemo(() => editable ? buildContextMenu(actions) : false, [editable])`. The actions read `hotRef`, `orientationRef`, `writeStateRef` and `propsRef` at call time, so the object never changes between renders (see the React.memo note at the top of the component). The expression view's read-only grid gets no menu.
  - **Find references**: disabled unless `singleSelectedRecord`; run → `onFindReferences(record)`.
  - **Open this reference in a new tab**: disabled unless the range is one cell whose value resolves (`resolveReference(value, tableNames)` with the cell's `header.isReference`). This is stricter than v4, which enables it for any reference cell and then fails to find an `<a>` on an unresolvable one. run → `onFollowReference(resolved.tableId, resolved.recordIndex, 'background', cell)`.
  - **Set selected record(s) as empty**: disabled when `!canEmptyRecords(table)` or `recordsToEmpty(...)` is empty; run → `setRecordsEmpty(indices)` (below).
  - **Advanced... → Set as next empty record to use**: disabled unless `singleSelectedRecord` is in `writeState.emptyRecordIndices` (main enforces the same rule); run → `setNextRecordToUse(record)`.
- Keyboard: Handsontable 16 opens the menu with Shift+F10 and Ctrl+Shift+\ and handles arrow navigation. Nothing to add.

### Empty-record commands (`components/TableEditorComponent/useEmptyRecords.ts`, new)
```ts
export default function useEmptyRecords(
    hotRef: RefObject<HotTableRef | null>,
    getContext: () => CellWriteContext | null,     // from useCellWrites
    stateRef: MutableRefObject<WriteState>,
    orientationRef: RefObject<GridOrientation | null>
): { setRecordsEmpty(indices: number[]): Promise<void>; setNextRecordToUse(index: number): Promise<void> }
```
- Shares one private `run(call)`. It shows the loader ("Saving changes..."), waits a frame like `useCellWrites` (`:150`), and awaits the IPC call. Then:
  - On `error`: `console.error`, plus `showMessageBox({ type: 'error', title: 'Unable to set records as empty' | 'Unable to set the next empty record', message })`. v4 only logs (see Decisions).
  - Bail out if `hot.isDestroyed` or the context's table changed while waiting (same check as `useCellWrites:178`).
  - Otherwise `applyEmptyState(table, result, stateRef.current)`, then `hot.setSourceDataAtCell(toGridEdits(edits, orientation, orientation.toSourceCell), 'onEmpty')` and `hot.render()`.
  - Hide the loader in `finally`.
- Export `toGridEdits` from `useCellWrites.ts` so both hooks use it.
- Not undoable, as in v4. `onEmpty` is already in `IGNORED_CHANGE_SOURCES`, so the sync never reaches main or the undo stack. Earlier undo entries for those rows stay. Replaying one writes the old value, which un-empties the row when `autoUnempty` is on, as any edit does.

### References modal (`routes/TableEditor/components/ReferencesModal/`, new)
`ReferencesModal.tsx`:
```ts
interface Props {
    fileId: string;
    table: { tableId: number; name: string };
    recordIndex: number;
    // A picked row; the parent closes the modal
    onOpen: (reference: RecordReference, mode: OpenMode) => void;
    onClose: () => void;
}
```
- Uses `Modal` with title "References" and the same "X" close button as `JumpToColumnModal`. Esc and the underlay close it.
- Fetches `getReferencesToRecord` on mount and ignores the result after unmount. States:
  - loading: "Finding references..." (the scan reads every table that has reference columns, which can take seconds on a large file);
  - error: "Failed to load references: <error>";
  - empty: "No references.";
  - list.
- Header: "The following tables reference `(<id>) <name> - Record #<n>:`", as in v4.
- Rows are `<button>`s with `data-table-id` and `data-record-index`. The text is `(<tableId>) <name>`, as in v4, with a secondary `Record #<recordIndex> · <fieldName>` so repeated rows can be told apart (see Decisions). `onClick` → `onOpen(ref, getOpenMode(e))`; `onAuxClick` with button 1 → `'background'`; `onMouseDown` with button 1 → `preventDefault` (no autoscroll), as the sidebar does in 03u.
- Styles: `ReferencesModal.module.scss`, rows like v4's `.reference-link` (padding, white, hover/active from the existing button tokens), the list scrolls inside a `max-height: 80vh` dialog.

### Wiring (`FieldEditorView.tsx`)
- State `references: { tableId: number; recordIndex: number; from: CellPosition | null } | null`, dropped on a table switch like `jump`.
- `onFindReferences(recordIndex)`: `from = gridRef.current?.getSelectedCell()`; `deselectCell()` (as `openJumpToColumn` does, so the grid doesn't take the modal's keys); set state.
- `onOpen(ref, mode)`: close, then `handleFollowReference(ref.tableId, ref.recordIndex, mode, from)`. That is the existing reference path: the current tab pushes a history step (03f), a self-reference moves within the table, ctrl/middle opens a tab (03u). It opens at the **referencing record**, col 0 (v4 opens record 0; see Decisions).
- Close without picking: reselect `from`, like `closeJumpToColumn`.
- `isModalOpen` includes the references modal, so Ctrl+J is blocked. Alt+Left/Right are already blocked by `[role="dialog"]` (`TableEditor.blocksHistoryKeys`).

### Cleanup
- `TableEditor.tsx:537-551`: delete the commented-out `#reference-modal` markup. Leave the spline/underlay/loader lines (not this step's).
- `03-table-editor-parity.md`: link this plan from row 03g; fix "one row per referencing table" → per referencing record; describe Advanced as implemented with the empty-record guard; status.
- `plan.md`: add 03g to row 03's item list.
- `02-react-e2e.md:27`: no change (historical).

## Edge cases
- Right-click on a column header (normal view): rows from -1, so Find references and Set empty are disabled, as in v4. A row header click selects one whole record, so both work.
- Multiple selection layers (ctrl+click): only the last one counts.
- A table switch, tab switch or file close while an empty/next call is in flight: the result is dropped. The new table is read fresh from main, so it already has the change.
- A range that is all empty: Set empty is disabled. A mixed range sends only the non-empty rows (v4).
- `header.record1Size` missing: treated as 0, disabled.
- References modal open while the table changes (menu Close File): the state is dropped with the table, as `jump` is.
- Set as next empty record on the current head: allowed, no change.
- Inverted view: every item maps through `orientation`. The field-name column disables everything.

## Tests

### Vitest
- `components/TableEditorComponent/contextMenu.test.ts`: `selectedRecordRange` in both orientations (reversed range, row header, column header, inverted field-name column, inverted column header); `singleSelectedRecord`; `recordsToEmpty` skips empty rows; `canEmptyRecords` for `record1Size` 0/3/4/missing; `buildContextMenu` keys, order, labels, the Advanced submenu, and that `disabled`/`callback` call the actions.
- `components/TableEditorComponent/orientation.test.ts`: `toRecordIndex` in both orientations, including headers.
- `utils/cellWrites.test.ts`: `applyEmptyState` replaces the set, updates `recordMeta` both ways, writes the first-4-byte fields into `table.records`, and returns edits only for `offset < 32`. `planWriteResult`'s existing tests stay green.
- `ReferencesModal.test.tsx` (mocked `window.franchiseAPI.getReferencesToRecord`): loading, then list with header text and both lines; "No references."; error text; click → `onOpen(ref, 'current')`, ctrl+click → `'active'`, middle-click → `'background'`; Esc and X call `onClose`; a result after unmount is ignored.

### E2E
- New `tests/e2e/scripts/react/empty-records.spec.js`, port of v4 `empty-records.spec.js` (4097, rows 3 and 6, pointer texts, un-empty through the reference editor). v4 flips auto-unempty mid-test through the settings window. React sets preferences at launch (`launchWithDefaultOptions({ preferences })`), so the auto-unempty on/off parts become two tests. Adds the persisted check: save, reopen, `app.readTable(4097).emptyRecordIndices`.
- `react/cell-edit.spec.js`: port "the context menu can set a record as empty" (Player 4220, row 0 `LastName`, empty class, `readEmptyPlayerRows` contains 0).
- New `tests/e2e/scripts/react/context-menu.spec.js`:
  - Find references on a record with references (pick one with `getReferencesToRecord` while implementing, e.g. 4097 record 0). Checks the header text and the rows; clicking a row opens that table in this tab with the referencing record selected, and Back returns to the source cell; ctrl+click opens an active new tab; middle-click a background tab.
  - Find references on a record with none → "No references."
  - Disabled states: a two-row selection disables Find references; a non-reference cell disables Open this reference in a new tab; an all-empty selection disables Set empty.
  - Open this reference in a new tab: a background tab `<id> - <name>` appears and the current tab doesn't change.
  - Advanced → Set as next empty record on Player 4220 row 375 (empty). `app.readTable(4220)` shows `header.nextRecordToUse === 375` and 373/374 no longer in `emptyRecordIndices`; the grid's empty styling on 373 is gone; it survives save and reopen. The item is disabled on a non-empty row.
  - Inverted view: Set empty on a record column empties that record (styling plus `readTable`).
- Page models:
  - `models/react/ContextMenu.js`: `open()` (right-click the selected cell), `isEnabled(label)` (Handsontable's `htDisabled` class; it is Handsontable's own class, not a CSS module), `click(label)`, `clickAdvanced(label)` (hover "Advanced...", then click). Items are located by text inside `.htContextMenu`.
  - `models/react/ReferencesModal.js`: `waitForLoaded()`, `headerText()`, `items()` (texts), `clickItem(text, options)`, `close()`. Located by `role=dialog` with the name "References" and `data-table-id`.
  - `models/react/TableEditorPage.js`: `contextMenu`, `references`, and `setSelectedRecordToEmpty()`, `findReferencesToSelectedRecord()`, `openSelectedReferenceInNewTab()`, `setSelectedAsNextEmptyRecord()`.

## Verification
`npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`, `npm run test:unit`, `npm run e2eTest:react`. Run v4's `empty-records.spec.js` and `bulk-edit.spec.js` too, to confirm the main-process change didn't affect them.

## Decisions (approved)
1. **Advanced → Set as next empty record to use** is implemented (new main handler + preload method), limited to a single record that is already empty, since any other record can corrupt the chain parse. Alternative: leave it out, as it never worked in v4.
2. v4 keeps its broken Advanced item; this step doesn't wire the new IPC into `contextMenuService.js`.
3. References modal improvements over v4: a "Finding references..." loading state; each row also shows `Record #n · Field`; picking a row opens the referencing record (v4 always opens record 0).
4. Set empty / Set next failures show an error message box (v4 only logs to the console).
5. Open this reference in a new tab is enabled only for references that resolve to a known table (v4 also enables it for unresolvable references, then does nothing).
6. Set empty stays non-undoable, as in v4.
