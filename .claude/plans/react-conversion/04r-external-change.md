# 04r: External-change reload prompt

Index: [04-parity.md](04-parity.md). Builds on 04o (notification store, banner queue, drawer) and 04s2 (`revision`).

## Context
When the open file changes on disk (usually the game saving), v4 shows a banner with Dismiss / Branch and save new / Reload (`renderer/js/services/reloadFileService.js`, `index.html:47`). v5 shows the same banner and also adds a "File Changed" notification to the drawer. On top of v4, it pauses auto-save while the change is unresolved, so the game's save isn't silently overwritten.

How v4 works:
- `main.js:1237` `watchFile`: chokidar `change` → `file-changed`, unless a save of ours is pending (`pendingSaves`, which is popped 500ms after `saved`; `waitForFileSaved` is never set to true).
- Reload: `reload-file` goes to main and back (temporary title "Reloading..."), then `welcomeService.openFileFromPath` runs the full open flow again. Unsaved edits are dropped without asking.
- Branch and save new: `navigationService.js:647` → save dialog (`general.defaultDirectory`) → `saveFileAsAndOpen` → `file-loaded` (title + watcher move to the new path) → recent files.
- Delete/rename (`unlink`) isn't handled. That stays out of scope (follow-up in 04-parity.md).

## Decisions (confirmed with the user)
- Reload confirms when `hasUnsavedChanges` is true, with the same wording as `SchemaManagement.handleLoad`.
- Reload reopens in main with the same `fileId` (like `loadSchema`) and bumps `revision`. It does not run `useOpenFile` again, which would lose a manual schema, ask the common-file question again and overwrite the backup.
- The banner uses the default 8000ms timeout and severity `info`. The timeout only hides the banner; the drawer entry stays.
- The notification is removed by: Reload, Branch and save new, a save of ours to the file's own path, banner **Dismiss**, the drawer X, and closing the file. Save As to another path does not remove it.
- chokidar events are debounced in main (1000ms trailing) before the notification is added. v4's `file-changed` send stays immediate.
- The drawer item has two links: Reload and Branch and save new.
- Auto-save is paused while a `file-changed` notification exists for the file, **only while the v5 UI is loaded**. v4 behaves as today.
- While auto-save is paused (and only when auto-save is on), a static strip under the tab bar says so. It has Reload and Branch buttons and no close button of its own.
- Dismiss (banner or drawer X) resumes auto-save and saves any edits made while paused.
- v4's channels (`reload-file`, `save-new-file`, `file-changed`) and `reloadFileHandler.js` are not changed.

## Edge cases (all steps)
- One game save sends several change events → one notification and one banner (debounce). A later, separate write replaces the notification and shows the banner again.
- An external write that lands during our save is ignored (v4's existing rule).
- Edits made while paused: after Dismiss they are saved immediately. After Reload they are lost (with the confirm). After Branch they are written to the new path.
- UI switch v5 → v4 while paused: v4 isn't paused, so the next edit there auto-saves. v4 → v5 with a notification already there: the pause applies, and the strip shows from the store.
- `usePreference` reads `general.autoSave` once at mount. If auto-save is turned on while a notification exists, main pauses but the strip doesn't show until Layout remounts. Accepted (Settings is a separate window, rare).
- Reload while a mismatch exists: re-checked, and kept or removed.

## Steps

| Step | Scope | Plan | Status |
|---|---|---|---|
| 04r1 | Main: `fileWatcher.js` module (debounce, `file-changed` notification), `main.js` wiring, the `file-changed` type | [04r1-file-watcher.md](04r1-file-watcher.md) | Done |
| 04r2 | Main + preload: `franchise:reload-file`, removal hooks, auto-save pause, `onDismissed` | [04r2-reload-ipc.md](04r2-reload-ipc.md) | Done |
| 04r3 | Renderer refactor: `describe.ts` `links[]`, drawer renders several links. No visible change | [04r3-notification-links.md](04r3-notification-links.md) | Done |
| 04r4 | Renderer: `ExternalChangeContext` (reload, branch), banner and drawer actions for file-changed, e2e | [04r4-reload-actions.md](04r4-reload-actions.md) | Done |
| 04r5 | Renderer: auto-save paused strip, e2e | [04r5-auto-save-strip.md](04r5-auto-save-strip.md) | Done (uncommitted) |

## Order
- 04r1 and 04r3 are independent and can run in parallel (main vs renderer, no shared files).
- 04r2 needs 04r1 (both edit `main.js`; 04r2's pause check reads the `file-changed` notifications 04r1 adds).
- 04r4 needs 04r2 (IPC) and 04r3 (links).
- 04r5 needs 04r4 (it uses `ExternalChangeContext`).
- 04r1 replaces v4's watcher, so run the v4 e2e project after it.
