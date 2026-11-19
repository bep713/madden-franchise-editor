# 04r1: File watcher module and the `file-changed` notification

Index: [04r-external-change.md](04r-external-change.md). Main process and shared types only. Nothing in the UI shows the new notification yet (the drawer lists it with a fallback until 04r4 adds its text; see below). Independent of 04r3.

## Changes

### `main/services/fileWatcher.js` (new)
- `createFileWatcher({ send, store, shouldIgnore, debounceMs = 1000 })` → `{ watch(path, fileId), close() }`.
- `watch` closes any previous watcher and timer, then `require("chokidar")` lazily (kept off the boot path, as now) and watches `path`.
- On `change`: if `shouldIgnore()`, skip. Otherwise `send("file-changed", path)` right away (v4 listens), then restart a trailing timer of `debounceMs`. When it fires: if `shouldIgnore()` is true now, skip. Otherwise `store?.add({ kind: "file-changed", fileId, data: { path } })` (the store replaces an older one with the same kind and fileId).
- `close()` closes chokidar and clears the timer.
- Allow injecting the chokidar module (`options.chokidar`) so the unit test can pass a fake emitter.

### `main.js`
- Replace `baseFileWatcher` and `watchFile` with one `fileWatcher` created next to the notification store: `send` = `(channel, payload) => loggedMain?.send(channel, payload)`, `shouldIgnore` = `() => waitForFileSaved || pendingSaves.length > 0`.
- `file-loaded`: `fileWatcher.watch(currentFilePath, currentFileId)`. The three `baseFileWatcher.close()` sites (window close, `close-file`, app quit, around `main.js:445`, `637`, `1238`) → `fileWatcher.close()`.
- The startup profiler marks around the watch stay.

### Types: `src/shared/types/notifications.ts`
- `FileChangedData { path: string }` and `(NotificationBase & { kind: 'file-changed'; data: FileChangedData })` in the union.
- This makes `describeNotification`'s switch and `useNotificationBanners`' `actionsFor` non-exhaustive. Add a minimal `'file-changed'` case to each so typecheck passes: `describe` returns title "File Changed", description "`<name>` was changed outside the editor.", `bannerMessage` from v4 ("This save file has been modified outside of this program. Do you want to reload the file?"), severity `info`, and the current `linkLabel` "Reload" (04r3 turns this into `links`). `actionsFor` returns `[{ label: 'Dismiss', onClick: () => notifications.dismiss(n.id) }]` for now; 04r4 adds Branch and Reload. The drawer link is a no-op for this kind until 04r4.

## Edge cases
- A change that arrives after `close()` (chokidar's queue) finds no timer to restart; ignore it.
- Re-watching the same path on `file-loaded` after a branch (new path) or UI-switch restore replaces the old watcher.

## Verification
- `tests/unit/fileWatcher.test.js` (fake chokidar `EventEmitter`, fake timers via `node:test`'s `mock.timers`): three changes within the debounce give one `send` per change and one `store.add`; `shouldIgnore` true at event time → nothing; true only at fire time → `send` yes, `add` no; `close()` before the timer fires → no `add`; `watch()` again closes the old watcher.
- Vitest: `describe.test.ts` case for file-changed.
- `npm run test:unit`, `npm run typecheck`, `npm run test:react`, then `npm run e2eTest` (the v4 project covers the replaced watcher path).
