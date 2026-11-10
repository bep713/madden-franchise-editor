# 04r2: Reload IPC, removal hooks and the auto-save pause

Index: [04r-external-change.md](04r-external-change.md). Main, preload and shared types. Needs 04r1.

## Changes

### `FranchiseFileManager`
- `reloadFile(fileId)` in `_runExclusive`: reopen `entry.path` with `{ ...file.settings, autoSave: entry.autoSave, schemaDirectory: this._schemaDirectory }` and `{ fileId }`, the same way `_loadSchemaUnlocked` (`FranchiseFileManager.js:649`) does. This keeps `schemaOverride` and the year/type overrides in `file.settings` and skips the backup (`metaOptions.fileId` is set). Returns `{ fileId, metadata }`. If the reopen fails, `activeFiles` still holds the old entry.
- IPC `franchise:reload-file(fileId)`: on success remove `file-changed` for the fileId. If the reloaded file's `settings.schemaOverride` isn't set, run `checkSchemaMismatch` and `add` or `removeWhere` the `schema-mismatch` notification (same data shape as `franchise:open-file`). Return `{ fileId, metadata }`, or `{ error }`.
- `franchise:save-file-as-and-open` success → remove `file-changed` for the fileId.
- A successful save to the entry's own path (`saveFile` with no `path`, and the auto-save path through `_saveFileUnlocked`) → remove `file-changed` for the fileId. Put the hook where `savedCount` is updated (`FranchiseFileManager.js:584`), since that already identifies saves to its own path. Save As to another path doesn't remove it.
- `setAutoSavePausedCheck(fn)`. In `requestAutoSave`, return `Promise.resolve()` early when `fn?.(fileId)` is true (before queuing). `changeCount` still increases in the `change` handler, so `hasUnsavedChanges` is true.
- All hooks skip when no store is set (unit tests), as in 04o1.

### `notificationsHandler.js`
- `registerNotificationsHandlers(loggedIpc, store, { onDismissed } = {})`. `notifications:dismiss(id)` finds the notification, removes it, then calls `onDismissed?.(notification)`.

### `main.js`
- `franchiseFileManager.setAutoSavePausedCheck((id) => currentUi === "v5" && store.list().some((n) => n.kind === "file-changed" && n.fileId === id))`.
- `onDismissed`: for a `file-changed` notification, `franchiseFileManager.requestAutoSave(n.fileId)`. `requestAutoSave` does nothing if auto-save is off, and saves edits made while paused.

### Preload and types
- `franchiseAPI.reloadFile(fileId)` → `ipcRenderer.invoke("franchise:reload-file", fileId)`.
- `preload.d.ts`: declare `reloadFile` and the existing `saveFileAsAndOpen` (`(fileId, path) => Promise<{ path: string } | { error: string }>`).
- `src/shared/types/franchise.ts`: `ReloadFileResult = { fileId: string; metadata: FileMetadata } | { error: string }`.

## Edge cases
- Reload when the file is now corrupt or has no schema: `{ error }`, and the old in-memory file and the notification stay.
- `requestAutoSave` callers that await it get a resolved promise while paused.
- v4 Ctrl+S while a `file-changed` notification exists removes it (harmless; v4 doesn't show it).

## Verification
- `tests/unit/externalChange.test.js` (temp copy of the m22 career, fake `loggedIpc`, as `schemaNotifications.test.js`):
  - `reload-file` keeps the fileId, picks up bytes changed on disk, keeps a `schemaOverride`, writes no backup, removes `file-changed`, and doesn't touch other files' notifications.
  - Reload re-checks the mismatch: the m22 career gets one `schema-mismatch` after reload; with a `schemaOverride` it gets none.
  - `saveFile` to its own path removes `file-changed`; `saveFileAs` to another path doesn't; `save-file-as-and-open` does.
  - With the pause check true, an edit doesn't write the file and `hasUnsavedChanges` is true; with it false, auto-save writes.
  - `notifications:dismiss` calls `onDismissed` with the removed notification; an unknown id doesn't.
- `npm run test:unit`, `npm run typecheck`, `npm run e2eTest` (v4 project: save and open paths changed).
