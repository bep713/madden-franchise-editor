# 03e — Editing in the inverted view (outline)

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Depends on [03a-cell-editing.md](03a-cell-editing.md).

Status: outline only. Write the full plan before starting.

## Context
React has a Switch Orientation view that v4 doesn't have. Fields are rows and records are columns: `data[r] = [headers[r].name, ...records.map(rec => rec[headers[r].name])]`, built in `TableEditorComponent.tsx`. 03a makes this view read-only, because every write path in 03a assumes "visual row = record, column = field". This item makes the view editable with the same behaviour as the normal view.

## Approach
- **Coordinate mapping.** Add a mapping object, passed to `useCellWrites` and `planWriteResult`:
  - `toRecordCell(visualRow, visualCol) → { recordIndex, fieldName } | null` (row = header index, col ≥ 1 → record `col - 1`, col 0 → `null`)
  - `toVisualCell(recordIndex, fieldName) → [row, col]`

  The normal view uses the identity mapping (plus `toPhysicalRow`). Reverts, the per-row sync edits and the un-emptied-row class reset all go through it, not through raw `[row, prop]` tuples.
- **Data source.** The inverted arrays are copies, so a successful write has to update both `table.records` (the source of truth, used by export) and the inverted cell. Prefer updating it in place with `toVisualCell` (`setDataAtCell(..., 'onEmpty')`) over rebuilding the arrays, because a rebuild reloads the grid and clears undo.
- **Per-cell types.** A column holds mixed field types here, so `cells(row, col)` returns the header's editor, renderer and source (dropdown, reference, blob, text) instead of `columns` settings. Column 0 (field name) is read-only.
- **Empty and error state.** An empty record is now a column. Apply `table-cell--empty` by column in `cells()`. Error cells are looked up with `toRecordCell`.
- **Editors.** The reference and blob editors get `{ row, col }` from the grid and write back through `setDataAtCell`, so they work unchanged once the mapping is in place. Link navigation still selects (record, field 0) in the normal view, or (0, record + 1) when inverted.
- **Undo.** The undo stack stores visual coordinates. Switching orientation reloads data and clears it, the same as switching tables, which is acceptable.

## Tests (to detail in the full plan)
- vitest: the mapping round trip, `planWriteResult` with the inverted mapping (reverts and sync edits land on the right visual cells), `cells()` types per row.
- e2e: in `react/cell-edit.spec.js`, switch orientation, edit a text field and an enum field, check `readTable`, undo.
