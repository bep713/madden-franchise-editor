# 04v5: Page wiring and e2e

Index: [04v-schema-viewer.md](04v-schema-viewer.md). Needs 04v1–04v4. The only step that changes `SchemaManagement.tsx` and the only one with e2e.

**Touch:** `routes/SchemaManagement/SchemaManagement.tsx`, `SchemaManagement.module.scss`, `SchemaManagement.test.tsx`, `tests/e2e/scripts/react/schemaViewer.spec.js` (new), `tests/e2e/models/react/SchemaViewer.js` (new), and the existing Schemas page model in `tests/e2e/models/react/` (add the eye / link helpers there if it has row helpers).

## Changes

### State (`SchemaManagement.tsx`)
- `const [viewing, setViewing] = useState<{ source: SchemaFieldsSource; fallbackLabel: string; fileRevision?: number } | null>(null)`.
- `const [filters, setFilters] = useState<FieldFilters>(EMPTY_FILTERS)`. The filters stay when `viewing` changes from one schema to another. A `closeViewer()` helper sets `viewing` to null **and** resets the filters, and every close path uses it.
- Opening:
  - `viewEntry(entry)` → `{ source: { path: entry.path }, fallbackLabel: labelFor(entry) }`. If the pane already shows that path (`samePath`), do nothing.
  - `viewLoaded()`: if `entries` has an entry where `isLoaded(entry, metadata)`, call `viewEntry(entry)`. Otherwise (embedded, or outside both dirs) → `{ source: { fileId: openFile.fileId }, fallbackLabel: loadedLabel(metadata, entries, schemaDir), fileRevision: openFile.revision }`.
- The header label each render: for a `{ path }` source with an entry at that path, `labelFor(entry)`; else `fallbackLabel`.
- Closing on its own:
  - An effect on `entries`: a `{ path }` source with no entry at that path any more → `closeViewer()`. This covers a refresh and a delete. Skip it while `entries` is still the initial empty array before the first load, so a pane can't close because the list hasn't loaded yet. (In practice the pane can't open before the list loads, but guard it anyway.)
  - An effect on `openFile?.fileId` / `openFile?.revision`: a `{ fileId }` source whose `fileId` differs or whose `fileRevision` differs → `closeViewer()`. A `{ path }` source is left alone (the decision is to stay on the old schema).
  - `handleDelete`: after a successful delete of the viewed path, `closeViewer()` right away, without waiting for the refresh effect.

### Layout
- Wrap the existing `<main className={styles.main}>…</main>` in `<Allotment onVisibleChange={(i, v) => { if (i === 1 && !v) closeViewer(); }}>` with two panes, like Welcome's nested drawer (`routes/Welcome/Welcome.tsx`, around line 180):
  - Pane 0: the current `<main>`, unchanged.
  - Pane 1: `minSize={360}`, `preferredSize='45%'`, `snap`, `visible={!!viewing}`. It renders `{viewing && <SchemaViewer key? … />}`. Don't pass a `key` that changes per schema, or the sort reset and keep-old-rows behavior from 04v4 is lost.
- The `Allotment` needs a height. Check how `.page` / `.main` size today and how Welcome's CSS gives its `Allotment` a height, and do the same (likely `.page` a flex column with the `Headline` on top and the `Allotment` wrapper `flex: 1; min-height: 0`). Keep `.main`'s own scrolling, so the sticky action bar still sticks inside pane 0. The `{loader}` and `{commonFileModal}` stay outside the `Allotment`.
- The page must look the same as now while the pane is closed (compare at the default window size and at `E2E_WINDOW_SIZE=1024x728`).

### Props
- `SchemaActionBar onViewLoaded={metadata?.schemaList?.meta && !pending ? viewLoaded : undefined}`.
- `cardProps` gets `onView: viewEntry` and `viewingPath: viewing && 'path' in viewing.source ? viewing.source.path : undefined`.

## Verification
- `SchemaManagement.test.tsx` (mock `getFields` as 04v4 does, and `AutoSizer`):
  - No "View loaded schema" with no file or with a pending file; it is there with a loaded schema.
  - An eye opens the pane with that row's label in the header; the row gets `data-viewing`.
  - Type a filter, click another row's eye: the header changes and the filter input keeps its value.
  - The close X and then reopening: the filters are empty.
  - Deleting the viewed custom schema closes the pane.
  - A refresh that drops the viewed path closes the pane.
  - "View loaded schema" with a loaded path in `entries` uses `{ path }`; with no matching entry, `{ fileId }`, and a `revision` bump then closes it.
  - Loading another schema while viewing the loaded one by path: the pane stays open on the old path.
- E2E `tests/e2e/scripts/react/schemaViewer.spec.js`, with `models/react/SchemaViewer.js` (`waitForOpen`, `close()`, `header()`, `setFilter(col, text)`, `filterValue(col)`, `clearFilters()`, `count()`, `rows()` → `[{ field, table, type }]` from the `data-*` attributes, `clickTable(i)`, `clickType(i)`, `sortBy(col)`, `isOpen()`). Use `waitFor()` / `util/poll.js`, not `expect(locator)`, and no CSS-module class names.
  1. No file open → Schemas: no `view-loaded-schema` link. The eye on the bundled M22 row → the header is `"<row label> Schema Viewer"`, the count is above 0, and a known field row is listed.
  2. Filter Field, then Table, then Type: the count drops and every row matches. A quoted Table filter: every row's table equals it exactly. Clear filters.
  3. Click a Table cell → the Table filter is `"<name>"` and every row has that table. Click a `jump-type` button → the Table filter changes to the referenced table.
  4. Sort by Field: asc changes the first row, desc reverses it, a third click restores the default first row.
  5. With a filter set, click another schema's eye (copy a custom M22 schema into userData's schema dir and refresh first, so there are two M22 rows): the header changes and the filter stays.
  6. Open the M22 test career (dismiss the mismatch banner with the shared helper) → Schemas → "View loaded schema": the header matches the loaded card's label. Load the custom copy from the list: the pane still shows the old schema.
  7. Close with the X, reopen: the filters are empty. Switch to Home and back: the pane is closed.
  8. View the custom copy and delete it (when it isn't loaded): the pane closes.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react && npm run test:unit`, then `npm run build:react && npm run e2eTest:react`. The full `npm run e2eTest` once at the end, since `SchemaManagement`'s layout changed under the existing schema-management spec.
- Manual: drag-to-close, resizing, `E2E_WINDOW_SIZE=1024x728` with the pane open, scrolling a 21k-row schema (M25+), typing a filter on it.
