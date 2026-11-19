# 04w: Welcome open flow gaps

Index: [04-parity.md](04-parity.md). Builds on the existing `useOpenFile` hook (04o3) and the Welcome route.

## Context
v4's `welcomeService.js` has two open behaviours that v5 lacks:

1. **Missing file** (`welcomeService.js:313-340`, `openFileFromPath`): before it opens anything, `await electronAPI.fs.exists(path)`. If the file is gone it shows
   `showMessageBox({ type: "error", title: "File not found", message: "Could not find the selected file. You may have renamed or deleted it." })` (not awaited), then `recentFileService.removeFile(path)` and re-renders the list. The current file stays open, because the check runs before the `open-file` event.
   v5: `useOpenFile.ts:57` calls `franchiseAPI.getMetadataFromFilePath(path)` first. For a missing file it rejects with ENOENT, so `Welcome.tsx:102` `initializeFile` throws an unhandled rejection: no message, and the entry stays in the list. The same happens for a game save card whose file was deleted after `files.getSaves`, and for Schema Management's `handlePick` (that one catches it and shows a generic error).
2. **Default directory** (`welcomeService.js:296-298`): the Open dialog passes `defaultPath: preferencesService.getValue("general.defaultDirectory")`. v5's `Welcome.tsx:80-90` `handleOpenFile` passes no `defaultPath`. v5's Save As already reads it (`useFileMenuCommands.ts:46-56`, `ExternalChangeContext.tsx:121-126`).

Also found: the Welcome side nav's "Open a file..." item (`SideNav.tsx:12-16`) has no click handler, so it does nothing.

## Decisions (confirmed with the user)
- The existence check goes in `useOpenFile`, so every caller gets it: recent files, game save cards, the Open dialog, and Schema Management's pending re-open.
- Use v4's message box text unchanged.
- Other `getMetadataFromFilePath` errors (permissions, locked by the game, bad header) show the box useOpenFile already uses for a failed `openFile` (`Could not open <name>.` with the error as detail). The recent entry stays. The current file stays open.
- Wire the side nav's "Open a file..." to the same `handleOpenFile`.
- Out of scope: v4's loader while a file opens from Home. Logged as a new parity item, 04l.
- v4 unchanged. No main or preload channel changes (`fs:exists` and `recent-files:remove` exist; only `preload.d.ts` gains declarations).

## Design

### `src/renderer/src/preload.d.ts`
- `electronAPI.fs` gains `exists: (filePath: string) => Promise<boolean>` (preload `franchisePreload.js:267`, main `main.js:929`).
- `recentFiles.removeFile` is already declared.

### `src/renderer/src/hooks/useOpenFile.ts`
- `OpenFileResult` gains `| { status: 'missing'; recentFiles: RecentFileEntry[] }`.
- At the top of `openFileAt`, before the common-file branch and before `closeFile`:
  - `if (!(await window.electronAPI.fs.exists(path)))`: remove the entry with `recentFiles.removeFile(path)`, then `await showMessageBox` with v4's options (`type: 'error'`, `title: 'File not found'`, v4's message), and return `{ status: 'missing', recentFiles }`. Removing before the box means the list behind the modal is already updated, as in v4, where the box isn't awaited.
- Wrap the `getMetadataFromFilePath` call in try/catch. On a throw, show `Could not open ${basename(path)}.` with `detail` set to the error message, through the same message-box call the `openFile` error branch uses (pull that into a small local `showOpenError(path, detail)` helper), and return `{ status: 'error', error }`. Nothing has been closed at that point.
- The "follows v4" comment above the hook mentions the existence check.

### `src/renderer/src/routes/Welcome/Welcome.tsx`
- `initializeFile`: when `status === 'opened' || status === 'missing'`, `setRecentFiles(toRecentFiles(result.recentFiles))`. When it's `'missing'`, also refresh the game save cards by pulling the `getSaves` effect body into a `loadSaves()` function, called on mount and here. Then a game card for a deleted save disappears too.
- `handleOpenFile`: read `general.defaultDirectory` with `preferences.getValue` and pass `defaultPath` only when it is a non-empty string, the same pattern as `useFileMenuCommands.ts:46-56`. Keep `properties: ['openFile']`.
- Pass `onOpenFileClick={handleOpenFile}` to `SideNav`.

### `src/renderer/src/routes/Welcome/SideNav.tsx`
- New optional prop `onOpenFileClick`, added to the `onClick` map under `openFile`. Add `'data-action': 'open-file'` to that item so e2e can target it.

### Schema Management
No change. `handlePick` gets `{ status: 'missing' }` back instead of a throw, and its `finally` hides the loader. `pending` stays set, so the "pick a schema" banner remains. That matches v4, which keeps its schema-manager prompt until it's closed.

## Edge cases
- Missing file while another is open: the check runs before `closeFile`, so the open file and its unsaved edits stay (v4 behaves the same).
- File deleted between the check and `openFile`: `openFile` returns `{ error }`, and the existing "Could not open" box shows. The entry stays, as it would in v4.
- A missing path that isn't in recents (Open dialog race, game card): `removeFile` is a no-op that returns the current list.
- Remembered common-file choice for a missing path: left in `commonFileChoices.json`. v4 doesn't clean its overrides either, and the entry is harmless.
- `fs.exists` itself rejecting (IPC failure): let it propagate. It isn't a v4 case, and it would mean the bridge is broken.
- `general.defaultDirectory` unset, or set to `""`: no `defaultPath`, so Electron uses its last folder (v4 passes `undefined` too).
- A `defaultDirectory` that no longer exists: Electron falls back on its own. No check.

## Steps
One step, renderer only.

## Verification
- `npm run typecheck`, `npm run lint`, `npm run test:react`.
- Vitest, new `src/renderer/src/hooks/useOpenFile.test.ts` (or a new describe in `Welcome.test.tsx`, whichever fits the existing mocks; `Welcome.test.tsx` already mocks both APIs, so extend it with `fs.exists` defaulting to `true` and `recentFiles.removeFile`):
  - Missing file: `showMessageBox` is called with v4's title and message, `removeFile` with the path, `openFile`/`closeFile`/`getMetadataFromFilePath` aren't called, and the Recent Files card re-renders without the entry.
  - Missing file while one is open: `closeFile` and `setOpenFile` aren't called.
  - `getMetadataFromFilePath` rejects: a "Could not open" box with the error as detail, no `removeFile`, no `closeFile`, no unhandled rejection.
  - Open dialog: with `general.defaultDirectory` = `C:/saves`, `showOpenDialog` gets `defaultPath: 'C:/saves'`. With it unset there is no `defaultPath` key.
  - Side nav "Open a file..." calls `showOpenDialog`.
- e2e, extend `tests/e2e/scripts/react/smoke.spec.js` or add `tests/e2e/scripts/react/welcome-open.spec.js` (prefer a new file, since smoke is the quick-run path):
  - "a missing recent file is removed": copy `sandbox.careerPath` to a second name in `sandbox.dir` and open it (it goes into recents), open `sandbox.careerPath`, delete the copy, `stubMessageBox(electronApp, 0)`, click the copy's recent entry. Poll `messageBoxCalls` for `title: 'File not found'`, poll until `welcome.recentFile(copyName)` has count 0, and check that `getActiveFileId()` is unchanged (the original is still open).
  - "the Open dialog starts in the default directory": launch with `preferences: { general: { defaultDirectory: sandbox.dir } }`, record the dialog options, click "Open a file...", and assert `defaultPath === sandbox.dir`.
  - Needs `util/dialogStubs.js`: `stubOpenDialog` also pushes each call's options to `globalThis.__openDialogCalls`, plus a new `openDialogCalls(electronApp)`, the same as `messageBoxCalls`.
  - `models/react/WelcomePage.js`: `sideNavOpenFileLink` (`[data-action="open-file"]`).
- `npx playwright test tests/e2e/scripts/react/welcome-open.spec.js` after `npm run build:react`, then `npm run e2eTest:quick`.
- v4 is untouched, but `dialogStubs.js` is shared, so run the v4 specs that use `stubOpenDialog`, if any (`grep -l stubOpenDialog tests/e2e/scripts/*.spec.js`).

## Index updates when done
- `04-parity.md`: 04w row → link this file, status Done. Add row **04l**: "Loader while a file opens from Home: v4 shows `.loader-wrapper` from `openFileFromPath` (`welcomeService.js:317`) until the editor is ready; v5 Welcome shows nothing during `openFileAt`". Not written / Not started.
- `plan.md`: tick the 04w checklist item; add `- [ ] Welcome: loader while a file opens (04l)`; add 04l to the open list in row 04.
