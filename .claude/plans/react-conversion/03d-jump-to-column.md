# 03d — Jump to column modal

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Only reads data, so it doesn't depend on 03a's write path.

## Goal
Port v4's "Jump to column" modal to the React table editor, with the same behaviour. Changes to how it behaves come after the port.

## v4 behaviour (what is being ported)
- Markup: `renderer/table-editor.html:10` (the "Jump to column" action link) and `:25-38` (the modal: title, X, the text "Jump to the following column at the following row", a Selectr column `<select>`, a row `<input type="text">`, a Go button).
- Logic: `TableEditorView._addEventListeners` (`renderer/js/services/table-editor/TableEditorView.js:290-381`). Ctrl+J: `TableEditorWrapper._onKeyOpenJumpToColumnModal` (`TableEditorWrapper.js:278`). Esc: `_modalCloseListener` (`:263`).
- Opening (button or Ctrl+J):
  - Ctrl+J first calls `hot.deselectCell()`, so keys typed in the modal don't reach the grid.
  - The row input is prefilled with the currently selected row (`currentlySelectedRow`).
  - The column list is every header of the table, in header order.
  - The column dropdown opens with its search box focused, so you can type straight away.
- In the dropdown (Selectr): typing filters the list by case-insensitive substring, ArrowUp/ArrowDown move the highlight (the first match starts highlighted), and Enter picks the highlighted column.
- Go (the button, or Enter **anywhere** while the modal is open, including the Enter that picks a column):
  - The column is the chosen one's index. If nothing was chosen, it is 0.
  - The row is `parseInt` of the input. NaN or a negative number becomes 0. There is no upper bound check.
  - The modal closes, a back-button `navSteps` entry is pushed, and `hot.selectCell(row, col)` runs (it scrolls the cell into view).
- Esc closes every modal and reselects the previously selected cell. X closes without reselecting.
- Bugs that aren't ported: the Enter listener is added on `keydown` but removed on `keypress`, so the listeners pile up; with header types shown, the option text includes the `<div class="header-type">` HTML.

## Design

### Pure helpers (`routes/TableEditor/components/JumpToColumnModal/jumpToColumn.ts`, new)
```ts
export function filterColumns(names: readonly string[], text: string): { index: number; name: string }[]
export function parseRowIndex(text: string, rowCount: number): number
```
- `filterColumns`: case-insensitive substring match on the trimmed text, kept in header order (as Selectr does). Empty text returns every column.
- `parseRowIndex`: `parseInt` like v4, and NaN or a negative number becomes 0. It also clamps to `rowCount - 1` (see Decisions). For a table with no rows it returns 0.

### Modal (`routes/TableEditor/components/JumpToColumnModal/JumpToColumnModal.tsx`, new)
```ts
interface Props {
    columns: readonly string[];   // header names in order
    initialRow: number;
    rowCount: number;
    onJump: (row: number, col: number) => void;
    onClose: () => void;
}
```
- Built on `components/Modal` (title "Jump to column", portal, underlay, Esc). `headerAction` is an X `Button` with `aria-label='Close'`, the same as the reference editor.
- Body: the v4 text, an `Autocomplete` labelled "Column" (options from `filterColumns`, `value` = the column index, `label` = the name), a `Textbox` labelled "Row" (prefilled with `initialRow`), and a primary "Go" `Button`.
- On mount the column options are open and the column input is focused (new `Autocomplete` `autoFocus` prop, below).
- The chosen column is kept in state, which drives the input text, and in a ref. Enter is handled by an `onKeyDown` on the modal body that calls Go. The `Autocomplete` input's own Enter handler runs first in the same bubble and calls `onOptionSelect`, which sets the ref, so one Enter both picks the column and jumps, as in v4.
- Go → `onJump(parseRowIndex(rowText, rowCount), chosenIndex ?? 0)`. The parent closes the modal.
- Typing in the column input after a choice clears the choice (the text no longer names it), like the reference editor's `tableText`.

### Autocomplete keyboard support (`components/Autocomplete/Autocomplete.tsx`)
Selectr's arrows and Enter, which the React `Autocomplete` doesn't have yet:
- An internal highlight index. It resets to 0 whenever `options` changes or the list opens.
- Input `onKeyDown`: ArrowDown/ArrowUp open the list if it is closed, or move the highlight (clamped, no wrap, like Selectr). Enter, while the list is open with options, calls `onOptionSelect(options[highlight])` and `preventDefault`s. Every other key behaves as it does now.
- The highlighted option gets a `highlighted` class (same look as hover) and `scrollIntoView({ block: 'nearest' })`.
- New optional `autoFocus?: boolean`, passed to the `<input>`.
- Side effect: the reference editor's Table field also gets arrows and Enter. That is an improvement, and nothing there handles Enter today.

### Grid handle (`components/TableEditorComponent/TableEditorComponent.tsx`)
Extend `GridHandle`:
```ts
getSelectedCell: () => CellPosition | null;   // the last afterSelectionEnd cell, null after a header selection
deselectCell: () => void;                     // hot.deselectCell() + hot.unlisten()
```
- Implementation note: `getSelectedCell` can't read Handsontable's live selection, because a click on the action bar is an outside click and `outsideClickDeselects` clears the selection before the button's handler runs. The grid keeps the last selected cell in a ref instead.
- Implementation note: the modal's Enter handler also calls `stopPropagation`. Otherwise the same Enter reaches Handsontable's document listener after `selectCell` re-enables it, and opens the cell editor.

### Wiring (`routes/TableEditor/views/FieldEditorView.tsx`)
- `const [jumpFrom, setJumpFrom] = useState<CellPosition | null | undefined>()`. `undefined` means closed. Otherwise it holds the cell to go back to on close.
- `openJumpToColumn()`: read `gridRef.current.getSelectedCell()`, then `deselectCell()` (v4's Ctrl+J step, done for the button too, so the grid never takes the modal's keys), then `setJumpFrom(selected)`.
- `handleActionClick`: `TableActions.JUMP_TO_COLUMN` → `openJumpToColumn()`. The action bar item already exists and does nothing yet.
- Ctrl+J (and Cmd+J): a `document` keydown listener in a `useEffect` that `preventDefault`s and opens the modal. It is ignored when the jump modal, the reference editor or the blob editor is already open, or when the target is Handsontable's open cell editor (`.handsontableInput`), so an edit in progress isn't dropped. It lives in `FieldEditorView`, so SPEX tables (`ExpressionEditorView`, no jump action) don't get it. `main.js` has no Ctrl+J accelerator.
- Orientation mapping, because React has an inverted view that v4 doesn't:
  - Normal: `initialRow = selected?.row ?? 0`, jump → `selectCell(row, col)`, `rowCount = table.records.length`.
  - Inverted: the field is the row and record r is column r + 1. `initialRow = max(0, (selected?.col ?? 1) - 1)`, jump → `selectCell(col, row + 1)`.
  - The modal always talks in (record, field).
- On jump: `setJumpFrom(undefined)`, then `selectCell`. `afterSelectionEnd` already saves the new cell to the tab's view state.
- On close (X, Esc, underlay): reselect `jumpFrom` if it was set, then close. That is v4's Esc behaviour. v4's X doesn't reselect, but here the grid was deselected on open, so every close reselects (see Decisions).
- There's no back button in React yet, so v4's `navSteps` push has nothing to port. Whoever adds the back button should record jumps there.

### Cleanup (`routes/TableEditor/TableEditor.tsx`)
Remove the commented-out "Jump to column" modal block (the first `<div className='modal hidden'>…</div>`). The references/spline/underlay/loader parts stay.

## Edge cases
- No cell selected when the modal opens (the header was clicked): the row is prefilled with 0, and a close reselects nothing.
- A table with no records: Go selects row 0, which Handsontable ignores. Nothing breaks.
- A row like "12abc" → 12 (`parseInt`, like v4). "" → 0.
- Esc while the column list is open closes the whole modal, like v4. The `Modal`'s document listener handles it.
- Handsontable's own keydown handling: the grid is deselected while the modal is open, so Enter, arrows and typing don't reach it.
- A table switch while the modal is open (a background tab can't do this, but the menu can): `FieldEditorView` is keyed by table only for SPEX tables, so close the modal when `table` changes (an effect on `table.tableId`).

## Tests

vitest:
- `JumpToColumnModal/jumpToColumn.test.ts`: `filterColumns` (empty text, case-insensitive, substring, order kept, no match); `parseRowIndex` (number, "12abc", "", "-3", NaN, above the last row, no rows).
- `components/Autocomplete/Autocomplete.test.tsx` (new): ArrowDown/ArrowUp move the highlight with clamping, Enter selects the highlighted option, Enter with the list closed does nothing, the highlight resets when the options change, `autoFocus` focuses the input.
- `JumpToColumnModal/JumpToColumnModal.test.tsx`: opens focused with the options showing; typing filters; one Enter in the column input picks the highlighted column and calls `onJump(initialRow, index)`; Go with no column → col 0; the row input is used; X and Esc call `onClose`.

e2e:
- Models: `tests/e2e/models/react/JumpToColumnModal.js`, mirroring v4's `ColumnJumpModal` (`setColumn(name)` fills the column input and clicks the exact option, `setRowIndex`, `getRowIndex`, `go`, `close`, `isOpen`), with roles and labels only (dialog "Jump to column", "Column", "Row", "Go", "Close"). `TableEditorPage.openColumnJumpModal()` clicks `[data-action="JUMP_TO_COLUMN"]`, and `jumpToColumn(column, row)` does open, set, set, go, the same as v4's.
- `react/smoke.spec.js`: port v4's smoke step. On 7482, open the modal, LongName, row 52, Go → "New York". This replaces the `grid.selectCell(52, "LongName", …)` call there.
- `react/jump-to-column.spec.js` (new), on 7482:
  - The row is prefilled with the selected row.
  - Select a cell at row 10, press Ctrl+J, type `longn` and Enter → LongName at row 10 is selected, and its text matches `readTable`.
  - Esc → the previous cell is selected again.
  - Row "abc" → row 0.
  - In the inverted view, jump to LongName at row 52 → the selected cell shows "New York".
- `react/import.spec.js`: replace the `textAt` helper's header lookup with `tableEditor.jumpToColumn(column, row)`, as its comment asks. `react/cell-edit.spec.js`: switch `goToCell` to `jumpToColumn`. Row 2499 is then reachable, so drop the "(no jump to column yet, 03d)" workaround comment. That also removes thousands of arrow key presses from those specs.

## Verification
`npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`, `npm run build:react`, `npx playwright test --project=react tests/e2e/scripts/react/jump-to-column.spec.js tests/e2e/scripts/react/smoke.spec.js tests/e2e/scripts/react/import.spec.js tests/e2e/scripts/react/cell-edit.spec.js tests/e2e/scripts/react/reference-editor.spec.js` (the last one because `Autocomplete` changes). Update the 03d row in [03-table-editor-parity.md](03-table-editor-parity.md).

## Decisions (to confirm)
- A row past the last record is clamped to the last record. In v4, `selectCell` fails and nothing ends up selected after the deselect.
- Every close (X, Esc, underlay) reselects the previous cell. In v4 only Esc does, but the grid is deselected on open here.
- The column list uses substring matching in header order (Selectr's), not Fuse like the sidebar and the reference editor.
- The inverted view is supported through the coordinate mapping, instead of hiding the action there.
- Keyboard support goes into the shared `Autocomplete`, not into a modal-only control. The reference editor gets it too.
- The import/cell-edit specs switch to `jumpToColumn`. That changes existing React specs, and the v4 specs stay untouched.
