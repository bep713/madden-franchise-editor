# 04r4: Reload and Branch actions (banner and drawer)

Index: [04r-external-change.md](04r-external-change.md). Renderer and e2e. Needs 04r2 and 04r3.

## Changes
- **`utils/confirm.ts` (new)**: move `confirm(message, detail, button)` out of `SchemaManagement.tsx` (`:127`), unchanged; SchemaManagement imports it.
- **`context/ExternalChangeContext.tsx` (new)**: `ExternalChangeProvider` and `useExternalChange()` → `{ reload(fileId), branch(fileId) }`. Provided in `Layout.tsx`, wrapping `NotificationBanners` and the tab layout. It reads `openFile`/`setOpenFile` through a ref (as `useFileMenuCommands` does), so the callbacks are stable. A `fileId` that isn't the open one is ignored. It renders its own `useLoader()` element.
  - `reload`: `hasUnsavedChanges` (a failure counts as dirty, as in `handleLoad`) → `confirm("Reload <name>?", "The file is reopened from disk. Unsaved changes will be lost.", "Reload")` → loader "Reloading file..." → `franchiseAPI.reloadFile` → `getTableList` → `setOpenFile(buildOpenFranchiseFile(fileId, metadata, tables, path, revision + 1))`. On `{ error }`, show an error message box ("Could not reload `<name>`."), and leave the file as it was.
  - `branch`: save dialog (`title: 'Save as...'`, `general.defaultDirectory` as in `useFileMenuCommands`) → cancelled: nothing → `saveFileAsAndOpen` → on `{ error }`, show the "Could not save the file." box → else `setOpenFile({ ...openFile, path })`, `recentFiles.addFile(path)`, `send('file-loaded', { path, type: metadata.type, fileId })` (main sets the title and re-watches).
- **`useNotificationBanners.ts`**: file-changed actions `Dismiss` (`notifications.dismiss(n.id)`), `Branch and save new`, `Reload` (primary), calling `useExternalChange()` through a ref like `selectTab`. Mark the notification read on Reload/Branch, like mismatch's Yes.
- **`NotificationDrawer.tsx`**: `reload` → `reload(n.fileId)`, `branch` → `branch(n.fileId)`.
- `describe.ts` (if not already): link labels "Reload" and "Branch and save new".

## E2E: `tests/e2e/scripts/react/external-change.spec.js` (new)
- Helper `touchExternally(path)`: read the file and write the same bytes back from the test process, so chokidar fires without changing the data. The reload test checks that an unsaved in-memory edit goes back to the on-disk value. Wait for the banner with `poll`/`waitFor` (debounce is 1s).
- Opening the career gets the mismatch banner first; use the shared `dismissBanners()` before triggering the change.
- Tests:
  - Banner shows the v4 text. Home drawer lists "File Changed" with `data-link='reload'` and `data-link='branch'`.
  - Reload, auto-save off: edit a cell (don't save), change the file, Reload, `stubMessageBox` accepts → the cell shows the on-disk value, and the drawer has no File Changed entry.
  - Reload with Cancel at the confirm → the edit stays, the entry stays.
  - Branch: `stubSaveDialog` to a temp path → the file exists there, the window title contains the new path, the entry is gone, and recent files include it.
  - Banner Dismiss → the drawer entry is gone.
- Page model: add the banner action helpers to the existing banner model in `tests/e2e/models/react/` if one exists, else a small `BannerComponent`.

## Verification
- Vitest: `ExternalChangeContext.test.tsx` (mocked APIs): the confirm only when dirty; cancel → no `reloadFile`; success → revision + 1 and the same fileId; error → message box, state unchanged; branch cancelled → nothing; branch success → path updated, `file-loaded` sent, recent file added. `useNotificationBanners.test.tsx`: the file-changed banner has three actions wired to the context. Drawer: the links call reload/branch with the fileId.
- `npm run typecheck && npm run lint && npm run test:react`, `npm run build:react && npm run e2eTest:react`.
