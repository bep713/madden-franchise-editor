# 04v4: `useSchemaFields` and `SchemaViewer`

Index: [04v-schema-viewer.md](04v-schema-viewer.md). Needs 04v2 (types, `preload.d.ts`, `schemaViewer.ts`). Tests mock `window.electronAPI.schema.getFields`, so 04v1 isn't needed to run them. Not mounted by the page yet (04v5).

**Touch only:** new folder `routes/SchemaManagement/components/SchemaViewer/` with `SchemaViewer.tsx`, `SchemaViewer.module.css`, `useSchemaFields.ts`, `SchemaViewer.test.tsx`, `useSchemaFields.test.ts`.

## Changes

### `useSchemaFields(source: SchemaFieldsSource)`
- Returns `{ fields: SchemaField[]; tableNames: ReadonlySet<string>; loading: boolean; error: string | null; retry: () => void }`.
- Key the effect on a stable string of the source (`'path:' + path` / `'file:' + fileId`), not the object, so a new object with the same source doesn't refetch.
- On a key change or `retry`: `loading = true`, `error = null`, keep the old `fields` until the new ones arrive (no flash of empty). Bump a request counter. When the call resolves, drop the result if the counter has moved on.
- `{ error }` results and thrown errors both set `error` (a string) and clear `fields`.
- `tableNames`: a `Set` of `fields[i].table`, built in a `useMemo` on `fields`.

### `SchemaViewer`
- Props: `{ source: SchemaFieldsSource; label: string; filters: FieldFilters; onFiltersChange: (f: FieldFilters) => void; onClose: () => void }`. The filters are controlled from outside, so they survive a source change (04v5 holds them).
- Local state: `sort: FieldSort`, reset to `null` when the source key changes.
- Derived: `deferred = useDeferredValue(filters)`, then `visible = useMemo(() => sortFields(filterFields(fields, deferred), sort))`.
- Layout (flex column, full pane height; only the list scrolls):
  - `<aside aria-label='Schema viewer' className={styles.viewer}>`.
  - Header like `NotificationDrawer`'s (read its CSS module and match the spacing, title size and icon button): `<h2>{label} Schema Viewer</h2>` plus a close X (`aria-label='Close schema viewer'`, `close.svg`).
  - Filters: three `<label htmlFor>` + `<input>` pairs with ids `schema-filter-field|table|type` and `data-filter='field'|'table'|'type'`; labels "Field", "Table", "Type". `onChange` → `onFiltersChange({ ...filters, [key]: value })`. A "Clear filters" `Link` (`data-action='clear-filters'`, `disabled` when `!hasFilters(filters)`) → `onFiltersChange(EMPTY_FILTERS)`. A hint line: `Wrap in "quotes" for an exact match`. The three inputs share one row when the pane is wide enough and wrap otherwise (`flex-wrap` with a `min-width`, or a container query if the codebase already uses them).
  - Count line `data-testid='field-count'`: `${visible.length.toLocaleString()} of ${fields.length.toLocaleString()} fields` when any filter is set, else `${fields.length.toLocaleString()} fields`. Hidden while loading the first time.
  - Grid: `role='table'`, `aria-rowcount={visible.length + 1}`. The header row (`role='row'`) has three `role='columnheader'` cells, each with a `<button data-sort-column='name'|'table'|'type'>` (text "Field" / "Table" / "Type" plus an ▲/▼ for the active column) and `aria-sort` `ascending`/`descending`/`none` on the cell. A click → `setSort(nextSort(sort, column))`. Columns are `grid-template-columns: repeat(3, minmax(0, 1fr))`, shared by the header and the rows through one CSS class.
  - Body: `AutoSizer` → `FixedSizeList` (`react-window`), `itemCount={visible.length}`, `itemSize={ROW_HEIGHT}` (a constant that matches the CSS row height), `itemKey` = `${table}.${name}` (unique within a schema), and a ref used to `scrollTo(0)` when the source key, `deferred` or `sort` changes.
  - Row (`role='row'`, `data-field`, `data-table`, `data-type` holding the raw values): three `role='cell'` cells, each with `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` and `title` set to the full text.
    - Field: text.
    - Table: a link-styled `<button data-action='filter-table'>` → `onFiltersChange({ field: '', type: '', table: exactFilter(table) })`.
    - Type: if `referencedTable(type, tableNames)` returns a name, a link-styled `<button data-action='jump-type'>` that does the same with that name; else text.
  - States:
    - First load: the existing `Loader` component (check its props; it must sit inside the pane, not cover the page) in place of the grid.
    - Error: "Could not read this schema." + the message + a "Retry" `Link` (`data-action='retry'`) → `retry()`.
    - Nothing matches: "No fields match these filters" in place of the list (headers stay).
- In jsdom `AutoSizer` measures 0×0 and renders nothing. In tests, mock `react-virtualized-auto-sizer` to call its child with fixed `{ height: 600, width: 400 }` (copy the `vi.mock` from `routes/TableEditor/components/TableSidebar/TableSidebar.test.tsx:9`).

## Verification
- `useSchemaFields.test.ts` (`renderHook`): loading → data; `{ error }` result; a thrown error; `retry` refetches; a slow first response that resolves after a second source's is ignored; the same source in a new object doesn't refetch; `tableNames`.
- `SchemaViewer.test.tsx`:
  - The header text is `"<label> Schema Viewer"`, and the close X calls `onClose`.
  - The count line with and without filters.
  - Typing calls `onFiltersChange` with that key changed. Clear filters is disabled when empty and calls with `EMPTY_FILTERS`.
  - Clicking a Table cell calls with `{ field: '', type: '', table: '"T"' }`. A reference Type is a button that does the same; a primitive type is plain text.
  - Sort cycle on one header: row order and `aria-sort` asc → desc → none.
  - The empty state; the loading state; the error state + Retry.
  - The sort resets when `source` changes.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`.
