# 04u: External delete or rename of the open file

Index: [04-parity.md](04-parity.md). Builds on 04r (watcher module, `file-changed` notification, auto-save pause, `ExternalChangeContext`, paused strip).

## Context
chokidar's `unlink` on the open file isn't handled by v4 or v5 (`main/services/fileWatcher.js:43` listens to `change` only; v4 on `master` the same, `main.js:1092`). If the user renames the file in Explorer, the next auto-save silently recreates it at the old path.

chokidar 3.5.3 on Windows (tested with a scratch script):

| On disk | Events |
|---|---|
| Atomic replace (unlink + write) | `change` only (`atomic` default merges them) |
| Delete / rename away | `unlink`, ~100ms later |
| Recreate / rename back | `change`, then `add` |
| Write after recreate | `change` (the watcher keeps working) |
| Watcher start | `add` for the file (initial scan) |

The library keeps the whole file in memory (`file.rawContents`, used by `_backupFile`), so editing keeps working while the file is missing. `file.save()` writes the path again; it fails if the folder is gone.

## Decisions (confirmed with the user)
- Same shape as 04r: a `file-missing` notification in main's store, a banner, a drawer entry, and the auto-save pause (v5 only).
- Actions: **Save here** (save to the original path, which recreates it), **Save as new** (the existing `branch` flow), **Dismiss** (resumes auto-save like `file-changed`, so the next auto-save recreates the file).
- The watcher stays open after `unlink`; it is what notices the file coming back. No new cleanup beyond the timer below.
- File comes back (`add`): `file-missing` is replaced by a `file-changed` notification, through the existing debounce. A rename back with identical bytes still shows File Changed. Accepted.
- No "Locate file" action. No window title change. v4 unchanged (no new channel sends to it).

## Edge cases
- Change then delete within the 1s debounce: `unlink` clears the timer, so no File Changed is added after File Missing.
- Existing File Changed, then delete: `unlink` removes it and adds File Missing (Reload can't work).
- Our own save while missing (Save here, Ctrl+S, Dismiss's auto-save): `saving` pushes `pendingSaves`, so the recreate's `change`/`add` are ignored; `_saveFileUnlocked` removes `file-missing` for an own-path save.
- Save here when the folder is gone: `saveFile` returns `{ error }`, the error box shows, the notification stays.
- Our own save's write never fires `unlink` (atomic merge + `shouldIgnore`).
- Close file: `FranchiseFileManager.js:1627` already removes every notification for the fileId.
- UI switch v4 → v5 while missing: the pause applies and the strip shows from the store (as 04r).
- Update install with a missing dirty file: the guard adds a line saying saving writes it back to its old path.

## Steps

### 04u1: Main
Files:
- `main/services/fileWatcher.js`
  - `lib.watch(path, { ignoreInitial: true })`, so the start-up `add` is skipped.
  - `store` now needs `add` and `removeWhere` (update the JSDoc).
  - `unlink`: same stale-watcher and `shouldIgnore()` guards as `change`; `clearTimer()`; `store.removeWhere(file-changed for fileId)`; `store.add({ kind: "file-missing", fileId, data: { path } })`. No v4 send, no debounce (chokidar already waits ~100ms).
  - `add`: same guards; restarts the debounce timer like `change` but without `send("file-changed")` (the paired `change` already sent it).
  - Timer callback: `store.removeWhere(file-missing for fileId)` before `store.add(file-changed)`, in the same tick, so auto-save never sees a gap with neither.
  - Pull the debounce into one `schedule()` helper shared by `change` and `add`.
- `main/services/FranchiseFileManager.js`: rename `_removeFileChanged` → `_removeExternalChange`, removing `file-changed` and `file-missing`. Call sites: `:596`, `:1678`, `:1689`.
- `main.js`
  - One helper `hasNotification(id, kinds)` over `notificationStore.list()`.
  - Pause check (`:129`): `file-changed` or `file-missing`.
  - `onDismissed` (`:139`): `requestAutoSave` for both kinds.
  - `createInstallGuard`: pass `hasMissingFile: (id) => hasNotification(id, ["file-missing"])`.
- `main/services/updateInstallGuard.js`: new `hasMissingFile = () => false` option; when a dirty file has one, add the detail line "The file was deleted or moved outside the editor; saving writes it back to its old path."

Tests (`npm run test:unit`):
- `tests/unit/fileWatcher.test.js`: fake store gains `removeWhere` (record predicates applied to a list); fake `watch` records options.
  - `watch` passes `ignoreInitial: true`.
  - `unlink` adds `file-missing`, sends nothing to v4.
  - `change` then `unlink` inside the debounce: only `file-missing` is stored after the timer would have fired.
  - Existing `file-changed`, then `unlink`: replaced.
  - `unlink` then `add`: after the debounce, `file-missing` removed and `file-changed` added; `add` sends no v4 `file-changed`.
  - `unlink` / `add` ignored while `shouldIgnore()`, and after `close()`.
- `tests/unit/externalChange.test.js` (check what it covers first): own-path save removes `file-missing`; Save As to another path doesn't.
- Install guard unit test if one exists; otherwise add the case where it fits.
- Run the v4 e2e smoke after (`npm run e2eTest:quick`), since the watcher is shared.

### 04u2: Renderer
Files:
- `src/shared/types/notifications.ts`: `FileMissingData { path: string }`, `kind: 'file-missing'` in the union.
- `src/renderer/src/notifications/describe.ts`: `NotificationLinkId` gains `'save-here'`. `file-missing` → title "File Missing", description "`<name>` was deleted or moved outside the editor.", links `[save-here "Save here", branch "Save as new"]`, banner "This save file was deleted or moved outside of this program. Save it again here, or save it to a new location?", severity `error`.
- `src/renderer/src/context/ExternalChangeContext.tsx`: add `saveHere(fileId)`: no-op unless it is the open file; `franchiseAPI.saveFile(fileId)`; `{ error }` or a throw → `showError('Could not save the file.', …)`. Add to the default context and the memo.
- `src/renderer/src/notifications/useNotificationBanners.ts`: `file-missing` actions Dismiss (`notifications.dismiss`), Save as new (`markRead` + `branch`), Save here (primary; `markRead` + `saveHere`).
- `NotificationDrawer.tsx` `linkAction`: `'save-here'` → `saveHere(n.fileId)`.
- `AutoSavePausedStrip.tsx`: new prop `reason: 'changed' | 'missing'`. Missing: "Auto-save is paused: `<name>` was deleted or moved outside the editor." with Save here / Save as new buttons (`onSaveHere`, `onBranch`); changed: as today (`onReload`, `onBranch`). Update its story and test.
- `routes/Layout/AutoSavePaused.tsx`: find a `file-changed` or `file-missing` notification for the open file (missing wins if somehow both); pass `reason` and the matching callbacks. Update the comment.
- `src/renderer/src/preload.d.ts`: nothing new (`saveFile` is declared).

Tests:
- vitest: `describe.test.ts` (file-missing text and link ids), `useNotificationBanners.test.tsx` (file-missing actions call dismiss / branch / saveHere), `ExternalChangeContext.test.tsx` (saveHere: success, `{ error }` shows the box, other fileId no-op), `AutoSavePaused.test.tsx` + `AutoSavePausedStrip.test.tsx` (missing reason text and buttons), `NotificationDrawer.test.tsx` (save-here link).
- e2e: new `tests/e2e/scripts/react/external-delete.spec.js`, same `launch()` pattern as `external-change.spec.js` (each test deletes or renames `sandbox.careerPath`). `models/react/Banner.js` gains `saveHere()` and `saveAsNew()`.
  1. Delete shows the `file-missing` banner with its message and a drawer entry (title, description, link ids `["save-here", "branch"]`).
  2. Banner Save here recreates the file; `readTableFromDisk` parses it; the notification is gone.
  3. Banner Save as new writes the new path, the title shows it, the notification is gone.
  4. Auto-save on: delete, the strip shows the missing text, an edit doesn't recreate the file; Dismiss (banner or drawer X) → the file is recreated with the edit.
  5. Rename away then back: `file-missing` is removed and a `file-changed` banner shows.

## Verification
`npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run test:react`, `npm run build:react`, `npx playwright test tests/e2e/scripts/react/external-delete.spec.js tests/e2e/scripts/react/external-change.spec.js`, then `npm run e2eTest:quick` for v4. Then tick the 04u box in `plan.md` and update the row in `04-parity.md`.

## Order
04u2 needs 04u1 for e2e only; its type and component work can start in parallel (no shared files).
