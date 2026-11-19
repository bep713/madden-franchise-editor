# 04v1: Schema fields IPC (main + preload)

Index: [04v-schema-viewer.md](04v-schema-viewer.md). Main and preload JS only. Independent of 04v2 and 04v3 (wave 1).

**Touch only:** `main/services/FranchiseFileManager.js`, `preload/franchisePreload.js`, `tests/unit/schemaFields.test.js` (new). Do not edit `src/` (04v2 owns the TS types and `preload.d.ts`).

## Changes

### `FranchiseFileManager`
- `async getSchemaFields(source)`, where `source` is `{ path: string } | { fileId: string }`. Exactly one key; anything else throws `Invalid schema source`.
  - `{ path }`:
    - Allowlist: `path.resolve(source.path).toLowerCase()` must equal the resolved, lowercased `path` of one entry from `this.getSavedSchemas()`. Otherwise throw `Not a known schema: <path>`. This stops the renderer from making main parse arbitrary files.
    - Parse it the way `addSchema` does (`new FranchiseSchema(p)`, `once("schemas:done")` registered **before** `evaluate()`, reject on a throw). Pull this into a private `_parseSchemaFile(p)` and make `addSchema` use it too. No behavior change for `addSchema`.
  - `{ fileId }`: `this.activeFiles.get(fileId)?.file.schemaList`. Throw `File not found` / `File has no schema` if either is missing. This exists for embedded schemas (no `path`).
  - Returns `{ meta, fields }`:
    - `meta`: `{ gameYear, major, minor }` from `schema.meta` (null if absent).
    - `fields`: one `{ name, table, type }` per attribute of each `schema.schemas[i]`. `type` is `attr.type ?? ''`. Table schemas with no attributes add no rows.
    - Order: tables by name with `a.localeCompare(b, undefined, { sensitivity: 'base' })`, then attribute order within a table.
- Cache (for `{ path }` only): `this._schemaFieldsCache = new Map()` keyed by the resolved, lowercased path, holding the built `{ meta, fields }`. On a hit, delete and re-set it (move to newest). After a set, while `size > 3`, delete the oldest key. `deleteSchema` deletes the deleted path's key after the `unlink` succeeds.
- IPC in `registerIpcHandlers`, next to the other `schema:*` channels (find where `schema:delete` is registered and match its style): `schema:get-fields` → `try { return await this.getSchemaFields(source) } catch (e) { return { error: e.message } }`. Use the same `{ error }` shape as `schema:delete`.

### Preload
- `electronAPI.schema.getFields: (source) => ipcRenderer.invoke("schema:get-fields", source)`, in the `schema` object next to `initialize` / `delete` (`preload/franchisePreload.js:325`).

## Verification
- `tests/unit/schemaFields.test.js` (`node:test`, `helpers/electronStub.js`; copy the manager setup from `tests/unit/schemaManagement.test.js`):
  - `{ path }` for a bundled M22 schema from `getSavedSchemas()`: `fields.length > 0`, contains a known `{ name, table, type }` (pick one from the file while writing the test), `meta.gameYear === 22`, and tables are in non-decreasing order under the same compare.
  - A path not in the list (e.g. a temp `.gz` copy outside both dirs) is rejected.
  - The same path in different case / slashes is accepted (Windows).
  - Two calls return the same `fields` array (cache hit, `===`).
  - LRU: four different paths, then the first one is parsed again (not `===` the first result).
  - `deleteSchema` on a custom copy drops it from the cache.
  - `{ fileId: 'nope' }` throws. `{}` and `{ path, fileId }` throw `Invalid schema source`.
  - `addSchema` tests in `schemaManagement.test.js` still pass (the shared parse helper).
- `npm run test:unit`.
