# 04o1: Notification store, IPC and schema hooks (main)

Index: [04o-schema-notifications.md](04o-schema-notifications.md). Main process, preload and shared types only. Nothing in the UI reads the store yet (04o4 does). Independent of 04o2 and 04o3.

## Changes

### Store: `main/services/notificationStore.js` (new)
- An in-memory list, created once in `main.js` and passed to `FranchiseFileManager` (a `setNotificationStore(store)` setter, like `_loggedIpc`) and to the new handler module.
- `add(notification)`: fills `id` (`crypto.randomUUID()`), `createdAt` (`Date.now()`) and `read: false`. Replaces an existing one with the same `kind` and the same `fileId` (removing it first, so the new one sorts as newest). Returns the stored notification.
- `remove(id)`, `removeWhere(predicate)`, `markRead(ids)`: unknown ids are no-ops, and nothing is sent if nothing changed.
- `list()`: newest first.
- Every change sends `notifications:changed` (the full list) to the main window. `add` also sends `notifications:added` (the stored notification). The store takes a `send(channel, payload)` function at creation; `main.js` passes one that sends to the main window's `webContents` if it exists.

### IPC: `main/handlers/notificationsHandler.js` (new)
- `registerNotificationsHandlers(loggedIpc, store)`, registered at the top of `main.js` like the other modules.
- `notifications:list` → `store.list()`; `notifications:dismiss(id)` → `store.remove(id)`; `notifications:mark-read(ids)` → `store.markRead(ids)`.
- Preload (`preload/franchisePreload.js`): `electronAPI.notifications = { list, dismiss, markRead, onChanged(cb), onAdded(cb) }`. `onChanged`/`onAdded` return an unsubscribe function that removes only that listener (unlike the legacy shim).
- `src/renderer/src/preload.d.ts`: declare `electronAPI.notifications`.

### Types: `src/shared/types/notifications.ts` (new)
```ts
type NotificationKind = 'schema-mismatch';   // 04o6 adds 'schema-missing'
interface SchemaMeta { gameYear?: number | null; major: number; minor: number; }
interface SchemaMismatchData { expected: SchemaMeta | null; loaded: SchemaMeta | null; gameType: string; }
interface AppNotification {
  id: string;
  kind: NotificationKind;
  createdAt: number;   // ms epoch
  read: boolean;
  fileId?: string;
  data: SchemaMismatchData;
}
```
Export from `src/shared/types/index.ts`. Reuse an existing schema-meta type if `franchise.ts` already has one with these fields.

### Mismatch check: `main/handlers/schemaMismatchHandler.js`
- Extract `checkSchemaMismatch(file)` → `{ hasMismatch, expected, used }`, exported. The handler calls it.
- Null `expectedSchemaVersion`: return `{ hasMismatch: false, expected: null, used }` instead of throwing. A missing loaded meta stays a mismatch, as now.

### Hooks: `FranchiseFileManager.registerIpcHandlers`
- `franchise:open-file`: after a successful `openFile`, if `options?.schemaOverride` is not set, run `checkSchemaMismatch` on the new entry's file. On `hasMismatch`, `store.add({ kind: 'schema-mismatch', fileId, data: { expected, loaded: used, gameType } })`, with `gameType` from the file's type (`'madden'` if missing, as `findGame` does).
- `franchise:load-schema`: after a successful load, `store.removeWhere(n => n.kind === 'schema-mismatch' && n.fileId === fileId)`. This runs whether the new schema matches or not. A failed load changes nothing.
- `franchise:close-file`: remove every notification with that `fileId`.
- A missing store (unit tests that don't set one) skips the hooks.

### Missing schema code
- In `franchise:open-file`'s catch, if `options?.schemaOverride` is not set: read the file's metadata with the same code `franchise:get-metadata-from-file-path` uses, apply `gameYearOverride`/`gameTypeOverride` from `options`, and call `schemaPicker.pick(gameYear, expected.major, expected.minor, { schemaDirectory }, gameType)` the way the library's `parse()` does. If it returns null, return `{ error, code: 'schema-not-found' }`. If the metadata read itself fails, or `pick` returns a schema, return `{ error }` as now.
- `src/shared/types/franchise.ts`: add `code?: 'schema-not-found'` to the open-file error shape.
- No notification for this yet (04o6). Welcome still shows its "Could not open" box.

## Edge cases
- v4 calls the same handlers, so v4 opens also create mismatch notifications in main. Nothing in v4 reads them, and a UI switch to v5 shows them, which is correct (the file is open and mismatched).
- `loadSchema` reopens with the same `fileId` and keeps notifications for other files.
- Changing a common file's year/type reopens through `franchise:open-file`, so it can notify.

## Verification
- `tests/unit/notificationStore.test.js`: add fills fields, replace per kind + fileId, remove, removeWhere, markRead, unknown-id no-ops (no event), list order, the events sent.
- `tests/unit/schemaMismatch.test.js`: `checkSchemaMismatch` match, mismatch, the year rule (with and without `expected.gameYear`), null expected, null loaded.
- `tests/unit/schemaNotifications.test.js` (temp copy of the m22 career, as `schemaManagement.test.js` does; call the registered handlers through a fake `loggedIpc` that records `handle` calls):
  - open → one `schema-mismatch` for that fileId with v328.1 / v329.1.
  - open with `schemaOverride` → none.
  - load-schema (any) → removed. close-file → removed.
  - Reopening the same path twice (close in between) → one notification.
  - Open as year 18 (`gameYearOverride: 18` on the FTC fixture) → `code: 'schema-not-found'`. A corrupt file → `{ error }` with no code.
- `npm run test:unit`, `npm run typecheck`, then `npm run e2eTest` (both projects; no visible change expected).
