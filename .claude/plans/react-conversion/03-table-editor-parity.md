# 03 — Table editor parity

Roadmap: [plan.md](plan.md). Previous: [02-react-e2e.md](02-react-e2e.md).

Bring the React table editor (`src/renderer/src/routes/TableEditor/`) to parity with v4's `renderer/js/services/table-editor/` for the features below. Each item has its own plan file in this folder. Write and review the item's plan before starting it.

| # | Item | Plan | Status |
|---|---|---|---|
| 03a | Cell editing and saving: writes through `franchise:write-bulk-table-cells` (paste, fill, undo/redo, reverts), enum/bool dropdowns, empty-row and error-cell display, reference renderer, link navigation and editor, blob editor, Save / Save As / Close File menu and shortcuts | [03a-cell-editing.md](03a-cell-editing.md) | Done (`bedefcf`, `d28514e`) |
| 03b | Table pinning: labelled Pinned section at the top of the sidebar (toggle remembered in preferences), pinned cards decorated in place with unpin on hover, pin/unpin from the action bar, shared `pins.json` with v4 | [03b-table-pins.md](03b-table-pins.md) | Done (`b1e1d7f`) |
| 03t | Navigation tabs: Home-only bar before a file opens, "Open Table..." replaced by per-table tabs (`<id> - <name>`, +, close, per-tab selection/scroll), Schedule/Schemas stubs, `general.defaultEditor` on file open | [03t-navigation-tabs.md](03t-navigation-tabs.md) | Done (`4249569`) |
| 03u | Open a table in a new tab: ctrl+click (active) / middle-click (background) in the sidebar and on reference links | [03u-open-in-new-tab.md](03u-open-in-new-tab.md) | Done (`83a9974`) |
| 03c | Export/import parity (v4 `ExternalDataHandler` / `externalDataService`): xlsx/csv export + import, raw table export/import, FRT export, File/Tools menu wiring | [03c-import-export.md](03c-import-export.md) | Done (`34e6e0b`) |
| 03d | Jump to column modal (v4 `TableEditorView` row/column jump): action bar + Ctrl+J, column search with arrows/Enter, row prefill, Esc restores the selection | [03d-jump-to-column.md](03d-jump-to-column.md) | Done (`073e912`) |
| 03e | Editing in the inverted (Switch Orientation) view, which 03a leaves read-only. The normal view stays canonical for export/import | [03e-inverted-editing.md](03e-inverted-editing.md) | Done |
| 03f | Back / forward navigation (v4 `TableEditorView.navSteps`, `.back-link`), browser-style: Back and Forward buttons left of the sidebar search, click moves one step, hold or right-click opens a history menu (id + name rows), Alt+Left/Right and mouse back/forward buttons. History is per tab (`TableTab.history`); new tabs start empty. Each entry stores the cell and scroll you left. Table loads, jump-to-column Go and same-table references push. Ports `back-button.spec.js` and the `// TODO(04+ back button)` block in `react/tabs.spec.js` | [03f-back-forward.md](03f-back-forward.md) | Done |
| 03g | Grid context menu (v4 `contextMenuService.js`), none in React today: **Find references to this record...** (single row; `franchiseAPI.getReferencesToRecord` → References modal, v4 `referenceViewerService`: "(id) name - Record #n:" header, one row per referencing record, click opens it in this tab, ctrl+click or middle-click in a new tab, "No references." and "Failed to load references: …" states); **Open this reference in a new tab** (single reference cell); **Set selected record(s) as empty** (`franchiseAPI.setTableRecordsEmpty` over the non-empty rows of the selection, disabled when all are empty or `header.record1Size < 4`, then refresh the first-4-byte fields of every row in `emptyRecords` plus the empty styling, with the loader); **Advanced... → Set as next empty record to use** (broken in v4; React implements it through a new main handler, `franchise:set-table-next-record-to-use`, limited to a single record that is already empty). Inverted view: map the selection through `orientation`. Port `empty-records.spec.js` and the "context menu can set a record as empty" test in `bulk-edit.spec.js` | [03g-context-menu.md](03g-context-menu.md) | Implemented (uncommitted) |

The reference editor and blob editor used to be separate items (03d, 03e). They are now part of 03a, because some fields can't be edited properly without them.

## Ordering and dependencies
- 03a goes first. 03t (tabs) goes before 03c; it changes `TableEditor.tsx`'s first-table effect and adds selection/scroll callbacks to the grid.
- 03c import and 03e need 03a's write path (`useCellWrites`, `planWriteResult`).
- 03f and 03g both move items out of plan.md's 04+ "Reference navigation" bullet. 03g's references modal opens tables the same way 03u does (`onFollowReference`'s `OpenMode`); if 03f lands first, a table opened from the modal pushes a history step.
- 03b and 03d only read data, so they don't depend on anything else. 03a and 03b both touch `TableEditor.tsx` / `FieldEditorView.tsx`, but different parts of them.
- 03c export is mostly done in step 01 (`FieldEditorView` export). Its plan will list what is still missing compared with v4.
- Each item ports the matching v4 e2e spec (or the relevant part of it) to `tests/e2e/scripts/react/`, or extends `react/smoke.spec.js`. [02-react-e2e.md](02-react-e2e.md) lists which v4 assertions were left for which item (03a edit/save/reference editor, 03c raw/FRT export, 03d jump to column).
- `TableEditor.tsx` still has a commented-out copy of v4's modal markup (jump to column, references, blob editor, reference editor). Each plan removes the part it replaces.
