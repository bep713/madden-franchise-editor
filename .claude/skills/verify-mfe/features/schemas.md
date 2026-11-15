# Schemas

The Schemas page lists the bundled and custom schemas, and shows which one is loaded for the open file. A user can open any schema in the schema viewer pane, which lists every field and can be filtered by field, table and type. The page works without a file open.

## Sub-features

- `list` lists the bundled schemas (including `M22 v329.1`) as rows.
- `view` opens a row in the viewer, whose header reads `<name> Schema Viewer`.
- `filter` narrows the field count (`N of TOTAL fields`) by field, table and type. Clear filters resets the count.
- `view-loaded` shows a "view loaded schema" action (`[data-action="view-loaded-schema"]`, `schemas.hasViewLoadedLink()`) only when a file is open.

## How to get to it (user POV)

- Click the `Schemas` tab in the top nav. It's available with or without a file open.

## Driving it with drive.js

Preconditions:

- The baseline from `README.md`. No file is needed.

- **Open page.** Call `await models.nav.openTab("Schemas")`, `await models.nav.waitForActiveTab("Schemas")` and `await models.schemas.waitForPageLoad()`. Take `shot("schemas")`.
- **View schema.** Call `await models.schemas.viewSchema("M22 v329.1")`, then `await models.schemaViewer.waitForOpen()`. `header()` returns `M22 v329.1 Schema Viewer`. Note `total` from `(await models.schemaViewer.count()).total`.
- **Filter.** Call `setFilter("field", "rating")`, then `setFilter("table", "player")`. `waitForCount(c => c.shown < c.total)` succeeds. `rows()` includes a field `AccelerationRating`. Take `shot("filtered")`.
- **Clear.** Call `clearFilters()`. `count()` returns `{ shown: total }` (only one number).
- **Close.** Call `models.schemaViewer.close()`. The `complementary` "Schema viewer" region is detached.

## Gotchas

- Schemas are cached in userData (`schemas/`), which is empty for every run. Custom-schema flows have to copy a schema in first, the way `schemaViewer.spec.js`'s `copyBundledToCustom` does.
- Viewer rows are virtualized, so `rows()` returns only the rendered ones.
- Filtering a table with quotes (`'"Player"'`) is an exact match. Without quotes, it matches substrings.
- The schema-management layout test fails at CI window size, an existing problem. Expect layout differences under `E2E_WINDOW_SIZE=1024x728`.
