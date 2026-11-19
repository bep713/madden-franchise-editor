# 04s1: Schema list/delete IPC and unsaved-change tracking

Index: [04s-schema-management.md](04s-schema-management.md). Main process, preload and shared types only. Nothing in the UI calls these yet; 04s3 does. Independent of 04s2.

## Facts this relies on
- `schemaPicker.retrieveSchemas(customDir)` (madden-franchise `dist/index.cjs:7609`) returns `{gameType: 'madden'|'college'|null, gameYear, major, minor, path}` for the bundled `data/schemas/<year>/` and the custom dir (plus its subfolders). `gameType` and `gameYear` are both null exactly when the filename has no `M`/`C` prefix.
- `franchise:load-schema` (`FranchiseFileManager.loadSchema`, line 602) reopens the file from disk with `schemaOverride`, keeping the same `fileId`. It returns `{status, metadata}` or `{error}`. Unsaved edits are lost, as in v4, which is why 04s3 needs `hasUnsavedChanges`. The entry is only replaced on `ready`, so a failed load keeps the old one.
- `electronAPI.schema.initialize()` (`schema:initialize`) already creates and returns `<userData>/schemas`.

## Changes

### `FranchiseFileManager`
- Extend the existing `getSavedSchemas()` (line 706, IPC `franchise:get-saved-schemas`, preload `franchiseAPI.getSavedSchemas`) instead of adding a new list call. No v4 renderer code calls this channel; v4 uses `schema-search:get-saved-schemas`. Changes:
  - Call `_ensureSchemaDirectory()` first, because `retrieveSchemas` `readdirSync`s the custom dir and throws `ENOENT` when it's missing (fresh install, or the folder deleted while the app runs).
  - Tag each entry `source: 'custom'` if its path is inside `_schemaDirectory` (same containment helper as `deleteSchema`), otherwise `'bundled'`. `gameYear` is already a number (the library `parseInt`s it).
  - Drop the `console.log`.
- `_isInSchemaDirectory(p)`: `const rel = path.relative(this._schemaDirectory, path.resolve(p)); return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);`. The `isAbsolute` check rejects another drive, where `path.relative` returns the absolute path, and `''` rejects the directory itself. `path.win32.relative` already compares case-insensitively. Both the `source` tag and `deleteSchema` use this one helper.
- `deleteSchema(schemaPath)`: resolve the path. Throw unless `_isInSchemaDirectory` is true and `fs.promises.stat(p).isFile()`, so a subfolder can't be targeted. Throw if any `activeFiles` entry's `schemaList.path` is the same file (compared case-insensitively). Otherwise `fs.promises.unlink`.
- Unsaved-change tracking, so a schema load only warns when there's something to lose:
  - Each `activeFiles` entry gets `changeCount` and `savedCount` (both 0 on open; a reload with the same `fileId` creates a new entry, so it starts clean).
  - The `file.on("change")` handler increments `changeCount` before the `suppressChangeEvents` check, so quiet writes count too.
  - `_saveFileUnlocked` reads `changeCount` before `file.save()` and stores it as `savedCount` only after the save succeeds, so a change made during the save keeps the file dirty. It does this only when the save targets the entry's own path: no `options.path`, or one equal to `entry.path`, as in `saveFileAsAndOpen`. A plain `saveFileAs` copy leaves the file dirty, because the original on disk is unchanged. Auto-save goes through `file.save()` in `requestAutoSave`, so clear the counts there the same way (or route it through `_saveFileUnlocked`).
  - `hasUnsavedChanges(fileId)` runs through `_runExclusive`, so a queued auto-save finishes first and doesn't trigger a needless prompt. It returns `changeCount !== savedCount`. A failed save stays dirty.
  - IPC `franchise:has-unsaved-changes` (in `registerIpcHandlers`), preload `franchiseAPI.hasUnsavedChanges(fileId)`.
  - Undo counts as a change, so an edit followed by its undo still prompts. That errs on the safe side.

### Handlers, preload, types
- `main/handlers/schemaHandler.js`: `schema:delete`, returning `{success: true}` or `{error}` (same try/catch shape as `franchise:load-schema`).
- `preload/franchisePreload.js`: `electronAPI.schema.delete(path)`.
- `src/shared/types/schemas.ts` (new, exported from `@shared/types`): `SchemaSource`, `SchemaEntry {gameType, gameYear, major, minor, path, source}`.
- `src/renderer/src/preload.d.ts`: declare `electronAPI.schema.{initialize, delete}`, `franchiseAPI.getSavedSchemas(): Promise<SchemaEntry[]>`, `franchiseAPI.loadSchema(fileId, path, saveSchema)` and `franchiseAPI.hasUnsavedChanges(fileId): Promise<boolean>`.

## Verification
- **Unit** (`tests/unit/franchiseFileManager.test.js`):
  - `getSavedSchemas` tags bundled and custom entries correctly (temp custom dir), and creates the custom dir when it's missing instead of throwing.
  - `deleteSchema` rejects a path outside the dir, a path on another drive (`D:\x.gz`), the dir itself, a `..` escape, a subfolder, and the loaded schema's path. It deletes a custom file, including one given with different letter case.
  - `hasUnsavedChanges`: false after open, true after a record write (including a suppressed one), false after `saveFile`, still true after `saveFileAs` to another path, false after `saveFileAsAndOpen`, false once a queued auto-save completes, and true when the save throws.
- Run `npm run test:unit && npm run typecheck`. Existing v4 e2e specs that save (`npm run e2eTest` or the save-related specs) still pass, since the save paths changed.
