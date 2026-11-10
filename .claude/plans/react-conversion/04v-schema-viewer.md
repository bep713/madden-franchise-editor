# 04v: Schema viewer (React)

Index: [04-parity.md](04-parity.md). Builds on 04s's Schemas page ([04s-schema-management.md](04s-schema-management.md)) and borrows the resizable pane from 04o4 ([04o4-notification-drawer.md](04o4-notification-drawer.md)).

## Context
v4's Schema tab (`renderer/schema-viewer.html`, `renderer/js/services/schemaViewerService.js`, `main/handlers/schemaViewerHandler.js`) lists every field of the open file's schema in three columns (field, table, type). It has three case-insensitive substring filters joined with AND, and a "Load more" button that renders 100 rows at a time. It only works with a file open, and only for the loaded schema.

In v5 the viewer is not a page of its own. It is a pane on the right of the Schemas page that can show **any** schema in the list, whether or not a file is open. It works like the Home notification drawer: you can resize it, drag it closed, or close it with an X.

Decisions (confirmed with the user):
- The pane is on the **right**, a nested `Allotment` pane like Welcome's drawer. Dragging it fully to the right snaps it closed.
- Every schema row gets an eye icon left of its trash / active / bundled icon, the loaded row included. The action bar also gets a "View loaded schema" link, which is **hidden** when no file is open.
- Rows come from the schema itself (every table schema once), not from the open file's tables. This also applies to the loaded schema, so the loaded and unloaded views match.
- The viewer is tied to a schema, not to "whatever is loaded". If the loaded schema changes while the pane shows it, the pane stays on the schema it opened. An embedded loaded schema has no file, so in that case the pane closes when the file is closed or the schema changes.
- The pane closes when you leave the Schemas tab (the route unmounts). Nothing is kept.
- The filters stay when the pane switches to another schema. A "Clear filters" button empties all three. The filters reset when the pane is closed and reopened.
- Long lists are virtualized with `react-window`: one fetch per schema, filtering in memory, no "Load more".
- Columns sort when you click their header (asc → desc → back to the default). The default is table A→Z, then each table's fields in schema order. The sort resets when the pane switches schemas.
- Extras: a count line ("1,204 of 21,139 fields"), clicking a Table cell to filter by that table, clicking a reference Type to jump to that table, and exact matching for filters wrapped in "quotes". Both click actions set Table to `"<name>"` and clear Field and Type.

## Facts that shape the design
- `new FranchiseSchema(path)` + `evaluate()` reads a schema file without a franchise file. `FranchiseFileManager.addSchema` (`main/services/FranchiseFileManager.js:686`) already does this, listening for `schemas:done` before calling `evaluate()`. M25 `M25_222_6.gz`: 3,125 table schemas, 21,139 fields, about 250 ms to parse in Node.
- An open file's `file.schemaList` is that `FranchiseSchema`. When the schema is embedded, `schemaList.path` is empty.
- `schemaList.schemas[i]` is `{ name, base, numMembers, attributes: [{ name, type, ... }] }`. Some attributes have no `type` (9 in M25).
- A reference type is another table schema's name, sometimes with `[]` on the end (`User[]`).
- `react-window` (1.8) and `react-virtualized-auto-sizer` are already dependencies.
- `SchemaManagement` is a route element in `App.tsx`, so it unmounts on a tab switch.

## Edge cases (owned by 04v5 unless noted)
- No file open: no action-bar link. The eye icons work, since viewing a schema doesn't need a file.
- Pending open (missing-schema flow): no action-bar link. The eyes still work, which helps the user pick a schema.
- Viewing the loaded schema, then loading another one: the pane stays on the old schema by path. The old row loses its bold "loaded" style.
- Viewing an embedded schema (`{ fileId }`), then the file closes or reloads (`revision` changes): the pane closes.
- Deleting the viewed custom schema, or the schema disappearing on a refresh: the pane closes. The loaded schema can't be deleted (04s).
- Bundled and custom copies of the same version: each is viewed by its own path, and the labels already tell them apart ("(Custom)").
- A schema file that fails to parse: the pane shows an error with "Retry", and the rest of the page keeps working (04v4).
- A fast double click on two eyes: the stale-response guard keeps the second (04v4).
- Window at 1024x728: the cards grid reflows inside the narrower main pane, and the viewer stays usable at 360px.

## Steps

| Step | Scope | Plan | Status |
|---|---|---|---|
| 04v1 | Main + preload JS: `getSchemaFields`, path allowlist, LRU cache, `schema:get-fields`, `electronAPI.schema.getFields`, unit tests | [04v1-schema-fields-ipc.md](04v1-schema-fields-ipc.md) | Done (uncommitted) |
| 04v2 | Shared TS types, `preload.d.ts`, pure utils `schemaViewer.ts` (filter, sort, reference lookup) + vitest | [04v2-viewer-utils.md](04v2-viewer-utils.md) | Done (uncommitted) |
| 04v3 | Eye icon on every `SchemaCard` row, `eye.svg`, `SchemaActionBar` "View loaded schema" link (props only, not wired) | [04v3-card-eye-actions.md](04v3-card-eye-actions.md) | Done (uncommitted) |
| 04v4 | `useSchemaFields` hook + `SchemaViewer` component (header, filters, count, sortable headers, virtualized rows, states) | [04v4-viewer-component.md](04v4-viewer-component.md) | Not started |
| 04v5 | Page wiring: `Allotment` pane, `viewing` state, open/close lifecycle, filters held by the page, e2e spec | [04v5-page-wiring.md](04v5-page-wiring.md) | Not started |

## Order
- **Wave 1 (parallel):** 04v1, 04v2 and 04v3 touch disjoint files.
  - 04v1: `main/`, `preload/`, `tests/unit/` only.
  - 04v2: `src/shared/types/schemas.ts`, `src/renderer/src/preload.d.ts`, `routes/SchemaManagement/schemaViewer.ts(+test)` only.
  - 04v3: `SchemaCard.*`, `SchemaActionBar.tsx`, `assets/icons/eye.svg` and their tests only. Not `SchemaManagement.tsx`.
- **Wave 2:** 04v4 needs 04v2 (types + utils). It mocks `getFields`, so it doesn't need 04v1 at runtime.
- **Wave 3:** 04v5 needs all four. It is the only step that changes `SchemaManagement.tsx`, and the only one with e2e.
- 04v1 adds a channel and a preload method but changes no existing handler, so the v4 e2e project isn't affected. Running the unit suite is enough.
- After waves 1–2 nothing is visible to the user (the eye's `onView` is optional and the page doesn't pass it yet). That's expected.
