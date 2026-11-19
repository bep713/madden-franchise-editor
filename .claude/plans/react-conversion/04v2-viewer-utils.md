# 04v2: Viewer types and pure utils

Index: [04v-schema-viewer.md](04v-schema-viewer.md). React/TS only, no components. Independent of 04v1 and 04v3 (wave 1).

**Touch only:** `src/shared/types/schemas.ts`, `src/renderer/src/preload.d.ts`, `src/renderer/src/routes/SchemaManagement/schemaViewer.ts` (new), `schemaViewer.test.ts` (new). `@shared/types` resolves to `src/shared/types.ts`, which re-exports the folder, so check that `schemas.ts`'s new exports come through it (add them if the file lists names).

## Changes

### Types (`src/shared/types/schemas.ts`)
- `SchemaField = { name: string; table: string; type: string }` (`type` is `''` when the schema has none).
- `SchemaFieldsSource = { path: string } | { fileId: string }`.
- `SchemaFieldsResult = { meta: SchemaMeta | null; fields: SchemaField[] }`. Reuse the existing `SchemaMeta` from `franchise.ts`.

### `preload.d.ts`
- In `electronAPI.schema`: `getFields: (source: SchemaFieldsSource) => Promise<SchemaFieldsResult | { error: string }>`, with a one-line comment in the file's style ("Bundled or custom schema by path, or an open file's embedded schema"). 04v1 implements the channel.

### `routes/SchemaManagement/schemaViewer.ts`
- `export type SchemaColumn = 'name' | 'table' | 'type'`.
- `export interface FieldFilters { field: string; table: string; type: string }` and `export const EMPTY_FILTERS: FieldFilters`.
- `export type FieldSort = { column: SchemaColumn; dir: 'asc' | 'desc' } | null`.
- `parseFilter(text) → { exact: boolean; value: string }`: trim. If the result is at least 2 chars and starts and ends with `"`, it is exact with the inside as its value (not trimmed again). A lone `"` or `""` gives `{ exact: false, value: '' }`. The value is lowercased.
- `filterFields(fields, filters) → SchemaField[]`: parse each filter once. A row matches when all three match (Field → `name`, Table → `table`, Type → `type`). An empty value matches anything; exact means a lowercased equality, otherwise `includes`. If all three are empty, return the input array itself (no copy), so memoized consumers stay cheap.
- `sortFields(fields, sort) → SchemaField[]`: `null` returns the input as is. Otherwise a stable sort of a copy by `localeCompare(…, undefined, { sensitivity: 'base' })` on the column, reversed for `desc`. Ties keep the input order (also for `desc`: compare and negate, don't `.reverse()`).
- `nextSort(current, column) → FieldSort`: a different column → asc; same column asc → desc; desc → `null`.
- `referencedTable(type, tableNames: ReadonlySet<string>) → string | null`: strip one trailing `[]`, return it if `tableNames` has it, else null.
- `exactFilter(name) → string`: `"${name}"`.
- `hasFilters(filters) → boolean`.

## Verification
- `schemaViewer.test.ts`:
  - `parseFilter`: plain, padded, `"Exact"`, `" spaced "` kept inside the quotes, lone `"`, `""`, a mixed case value lowercased.
  - `filterFields`: each column alone, AND across two, case-insensitive, exact vs substring (`"User"` vs `User` against `User` / `UserRegistry`), an empty `type` row with a Type filter set, all empty returns the same reference.
  - `sortFields`: each column asc/desc, stable ties both ways, `null` returns the same reference.
  - `nextSort`: the full cycle and a column change.
  - `referencedTable`: `User[]`, `User`, a primitive (`s32`), an unknown name.
- `npm run typecheck && npm run lint && npm run test:react`.
