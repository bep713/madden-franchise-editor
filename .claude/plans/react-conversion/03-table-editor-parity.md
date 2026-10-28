# 03 — Table editor parity

Roadmap: [plan.md](plan.md). Previous: [02-react-e2e.md](02-react-e2e.md).

Bring the React table editor (`src/renderer/src/routes/TableEditor/`) to parity with v4's `renderer/js/services/table-editor/` for the features below. Each item has its own plan file in this folder. Write and review the item's plan before starting it.

| # | Item | Plan | Status |
|---|---|---|---|
| 03a | Cell editing and saving: writes through `franchise:write-bulk-table-cells` (paste, fill, undo/redo, reverts), enum/bool dropdowns, empty-row and error-cell display, reference renderer, link navigation and editor, blob editor, Save / Save As / Close File menu and shortcuts | [03a-cell-editing.md](03a-cell-editing.md) | Done (`bedefcf`, `d28514e`) |
| 03b | Table pinning: labelled Pinned section at the top of the sidebar (toggle remembered in preferences), pinned cards decorated in place with unpin on hover, pin/unpin from the action bar, shared `pins.json` with v4 | [03b-table-pins.md](03b-table-pins.md) | Done (`b1e1d7f`) |
| 03t | Navigation tabs: Home-only bar before a file opens, "Open Table..." replaced by per-table tabs (`<id> - <name>`, +, close, per-tab selection/scroll), Schedule/Schemas stubs, `general.defaultEditor` on file open | [03t-navigation-tabs.md](03t-navigation-tabs.md) | Implemented (uncommitted) |
| 03c | Export/import parity (v4 `ExternalDataHandler` / `externalDataService`) | not written | Not planned |
| 03d | Jump to column modal (v4 `TableEditorView` row/column jump) | not written | Not planned |
| 03e | Editing in the inverted (Switch Orientation) view, which 03a leaves read-only | [03e-inverted-editing.md](03e-inverted-editing.md) (outline) | Not planned |

The reference editor and blob editor used to be separate items (03d, 03e). They are now part of 03a, because some fields can't be edited properly without them.

## Ordering and dependencies
- 03a goes first. 03t (tabs) goes before 03c; it changes `TableEditor.tsx`'s first-table effect and adds selection/scroll callbacks to the grid.
- 03c import and 03e need 03a's write path (`useCellWrites`, `planWriteResult`).
- 03b and 03d only read data, so they don't depend on anything else. 03a and 03b both touch `TableEditor.tsx` / `FieldEditorView.tsx`, but different parts of them.
- 03c export is mostly done in step 01 (`FieldEditorView` export). Its plan will list what is still missing compared with v4.
- Each item ports the matching v4 e2e spec (or the relevant part of it) to `tests/e2e/scripts/react/`, or extends `react/smoke.spec.js`. [02-react-e2e.md](02-react-e2e.md) lists which v4 assertions were left for which item (03a edit/save/reference editor, 03c raw/FRT export, 03d jump to column).
- `TableEditor.tsx` still has a commented-out copy of v4's modal markup (jump to column, references, blob editor, reference editor). Each plan removes the part it replaces.
