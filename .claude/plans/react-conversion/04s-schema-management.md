# 04s: Schema management page (React)

## Context
The React UI's "Schemas" tab is a stub (`implemented: false`). v4 splits schema handling between a separate schema-manager window (a list to pick from, add, scan) and the schema viewer's "Expected / Loaded" box. The new page is one control center: it lists every schema the user has per supported game, loads one into the open file, deletes custom ones, and shows whether the loaded schema matches the file. The action bar's "Add schema" and "Scan for schemas" get their own plan later.

Decisions (confirmed with the user):
- The Schemas tab is always shown (like Home), and the Welcome side nav's "Schema Management" item and the GetStartedCard link open it too.
- Trash: a confirm box, then delete. The loaded schema has no trash icon.
- Schemas named only by version (`220_0.gz`, no game type or year) go in an "Other schemas" card.
- Action bar: wire "Refresh schema list" and "Open schema directory" now. "Add schema" and "Scan for schemas" render disabled.
- Loading a schema confirms first only when the file has unsaved changes.

## Steps

| Step | Scope | Plan | Status |
|---|---|---|---|
| 04s1 | Main + preload: `getSavedSchemas` (dir check, `source` tag), `deleteSchema` + `schema:delete`, unsaved-change tracking + `franchise:has-unsaved-changes`, `SchemaEntry` type, `preload.d.ts` | [04s1-schema-ipc.md](04s1-schema-ipc.md) | Committed (`df8f934`) |
| 04s2 | `OpenFranchiseFile.revision`, tab rebuild on a same-`fileId` reopen, effects keyed on `[fileId, revision]`, `selectTab(key, file?)` | [04s2-reload-revision.md](04s2-reload-revision.md) | Committed (`b225712`) |
| 04s3 | `schemaList.ts`, `GameGrid` extraction, the page and its cards, `Link` `disabled`, Welcome wiring, nav flag, e2e | [04s3-schema-page.md](04s3-schema-page.md) | Committed (`9519810`) |

## Order
- 04s1 and 04s2 are independent and can be done in either order (or in parallel). 04s3 needs both.
- 04s1 changes the save paths (`_saveFileUnlocked`, `requestAutoSave`), so run the existing save e2e specs after it, not only the unit tests.
- 04s2 changes no visible behavior on its own, since nothing bumps `revision` until 04s3.
