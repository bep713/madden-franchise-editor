# 03 — Table editor parity

Roadmap: [plan.md](plan.md). Previous: [02-react-e2e.md](02-react-e2e.md).

Bring the React table editor (`src/renderer/src/routes/TableEditor/`) to parity with v4's `renderer/js/services/table-editor/` for the features below. Each item has its own plan file in this folder. Write and review the item's plan before starting it.

| # | Item | Plan | Status |
|---|---|---|---|
| 03a | Table pinning: labelled Pinned section at the top of the sidebar (toggle remembered in preferences), pinned cards decorated in place with unpin on hover, pin/unpin from the action bar, shared `pins.json` with v4 | [03a-table-pins.md](03a-table-pins.md) | Planned (reviewed) |
| 03b | Export/import parity (v4 `ExternalDataHandler` / `externalDataService`) | not written | Not planned |
| 03c | Jump to column modal (v4 `TableEditorView` row/column jump) | not written | Not planned |
| 03d | Reference editor (v4 `custom-renderers/` reference cell editor) | not written | Not planned |
| 03e | Blob editor (v4 binary/JSON blob editor modal) | not written | Not planned |

## Ordering and dependencies
- 03a and 03c only read data, so they don't depend on anything else.
- 03b import, 03d and 03e write cells. They need the roadmap's cell-editing item (`franchise:write-bulk-table-cells`, save, and a dirty indicator). Either plan that item before them or fold it into the first of them that is started. 03b export is mostly done in step 01 (`FieldEditorView` export); its plan will list what is still missing compared with v4.
- Each item ports the matching v4 e2e spec (or the relevant part of it) to `tests/e2e/scripts/react/`, or extends `react/smoke.spec.js`. [02-react-e2e.md](02-react-e2e.md) lists which v4 assertions were left for which item (03b raw/FRT export, 03c jump to column, 03d reference editor).
- `TableEditor.tsx` still has a commented-out copy of v4's modal markup (jump to column, references, blob editor, reference editor). Each plan removes the part it replaces.
