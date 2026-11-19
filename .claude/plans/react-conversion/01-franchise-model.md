# 01 — React UI on the existing preload APIs

Roadmap: [plan.md](plan.md). Previous: [00-toolchain.md](00-toolchain.md). This replaced the first version of step 01, which added a React-only `window.api.franchise.*` and `franchise-model:*` channels.

## Context
Step 01 (uncommitted) added a React-only `window.api.franchise.*` plus `main/handlers/franchiseModelHandler.js` that reshaped main-process data into the old React `FranchiseModel` / `FranchiseTableModel` types. That duplicates channels v4 already has. We are going the other way: the React code adopts the v4 bridge (`window.franchiseAPI`, `window.electronAPI`) and its response shapes, and the whole `window.api` object goes away (user chose "remove all of window.api"). Main-process behavior goes back to HEAD, except for two `files:*` channels that have no v4 equivalent.

Outcome: React Welcome → open file → table editor shows real data → export to xlsx/csv works, all through the same preload methods v4 uses.

## Phase 1: Remove the step-01 main/preload work
- Delete `main/handlers/franchiseModelHandler.js` and `tests/unit/franchiseModelHandler.test.js`.
- `git checkout` (back to HEAD) `main.js`, `main/services/FranchiseFileManager.js` (`getEntry`/`getActiveFileIds`), `main/handlers/recentFilesHandler.js` (`addRecentFile`) and `main/handlers/externalDataHandler.js` (`writeSpreadsheet`). Only the new handler used these helpers. The xlsx golden-byte tests in `tests/unit/externalData.test.js` check the revert.
- Keep the `TableEditor.tsx` `useMemo` filter fix, since that one is a renderer bug fix.
- Preload (`preload/franchisePreload.js`): delete the whole `contextBridge.exposeInMainWorld("api", …)` block. Add `files: { getSaves, openFolder }` to `electronAPI`, mapped to `files:get-saves` and `files:open-folder`.
- `main/handlers/filesHandler.js`: drop `files:get-recent-files`, since React will use `recent-files:*`. Keep `files:get-saves` (scans for saves per game) and `files:open-folder`, which have no v4 equivalent.

## Phase 2: Types for the v4 bridge
- Rename `src/renderer/src/api.d.ts` → `preload.d.ts`. Declare `window.franchiseAPI` and `window.electronAPI` with **only the methods React calls**: `openFile`, `closeFile`, `getActiveFileId`, `getMetadata`, `getTableList`, `readTableData`, `showOpenDialog`, `showSaveDialog`, `showMessageBox`, `getVersion`, `recentFiles.{initialize,addFile,removeFile,getRecentFiles}`, `externalData.export`, `welcome.revealInExplorer`, `files.{getSaves,openFolder}`. Grow it as later steps need more.
- In `src/shared/types/franchise.ts`, replace the step-00 model with the v4 response shapes, taken from `FranchiseFileManager.js`:
  - `FileMetadata` (`_buildMetadataUntimed`, line 453): `gameYear`, `type`, `format`, `tables`, …
  - `OpenFileResult` = `{ fileId, metadata } | { error }`
  - `TableListItem` (`getTableList`, line 994): `{ id, uniqueId, name, recordCount, isArray }`
  - `TableData` (`readTableData`, line 747): `records: Record<string, unknown>[]`, `headers: TableColumn[]` (`name`, `type`, `isReference`, `enum`, …), `recordMeta`, `emptyRecordIndices`, `cellErrors`, … plus `| { error }`
  - `FileType` becomes a string enum `FRANCHISE = 'franchise'`, `COMMON = 'franchise-common'`, matching v4's `metadata.format` and `navigation.json`. Update `data/navigation.ts`. This also fixes `Layout.tsx:21`, where `FRANCHISE = 0` is falsy and so skipped the format filter.
  - Remove `FranchiseModel`, `FranchiseTableModel`, `TableField`, `TableInput`, `ReadTableDataInput`, `ExportTableData*`, `FranchiseTableDataResult`.
- Add a renderer-only `OpenFranchiseFile` type for context state: `{ fileId, path?, metadata, tables: (TableListItem & { index })[], game? }`. `game` comes from `@data/games.json` by `gameYear`, and the name/directory are derived from `path` where they're needed.

## Phase 3: File lifecycle (Welcome, context, Layout)
- `context/FranchiseFileContext.tsx` and `hooks/useActiveFranchiseFile.tsx` hold `OpenFranchiseFile`. On mount: `franchiseAPI.getActiveFileId()`, then `getMetadata` and `getTableList`. After a renderer reload the path is unknown, as in v4, so "Open file location" hides when `path` is missing.
- `Welcome.tsx`, following v4's `navigationService.js:727`:
  - Close the previous file with `franchiseAPI.closeFile`.
  - Open with `electronAPI.showOpenDialog`, reading `filePaths[0]` and handling `canceled`.
  - Load with `franchiseAPI.openFile(path)`. On `result.error`, show `electronAPI.showMessageBox` (no schema picker yet; that stays the roadmap's schema item).
  - On success: `getTableList`, then `electronAPI.recentFiles.addFile(path)`, then set the context.
  - Recent files: call `recentFiles.initialize()` once on mount (v4 does the same in `recentFileService.js:7`). Map `{path, time}` to the existing `RecentFile` view shape in a small local helper, so `RecentFilesList` and its snapshot stay as they are.
  - Version: `electronAPI.getVersion()` returns a string; drop the `Version` wrapper. Saves: `electronAPI.files.getSaves()`. Folder actions: `electronAPI.files.openFolder` and `electronAPI.welcome.revealInExplorer`.
- Update `GetStartedCard.tsx` and `Layout.tsx` to read `OpenFranchiseFile` (`metadata.gameYear`, `metadata.format`, `game`, basename of `path`).
- Franchise-common files: v4 asks for FTC year/type overrides before opening. React opens without the prompt for now; add it to the roadmap.

## Phase 4: Table editor on `readTableData` / `externalData.export`
- `TableEditor.tsx`: the sidebar lists `OpenFranchiseFile.tables`. On select, call `franchiseAPI.readTableData(fileId, table.id)`. A `tableId` is stable inside one open file; the "prefer uniqueId" rule is about schema versions. Handle `{ error }` by clearing the selection and logging. Key the selection on `id`, as it is today.
- `TableEditorComponent.tsx`: take `TableData`. Columns come from `headers` (`data: header.name`) and rows are the flat `records`. In inverted mode, each header becomes a row: `[name, ...records.map(r => r[name])]`. The per-column type stays reachable through `headers` for later editors.
- `TableHeader`, `TableSidebar` and `TablePagination` switch to `TableListItem` / `TableData`.
- `FieldEditorView.tsx` export: use `electronAPI.showSaveDialog` to get the path, then build `headers`/`rows` from the loaded `TableData`, the same way `externalDataService.js:27` does, and call `electronAPI.externalData.export(path, headers, rows)`. Drop `openWhenDone`, because v4 doesn't open the file after export either.
- `ExpressionEditorView.tsx`: SPEX tables are never produced (no frtk). Keep the view, but make its export action a no-op with a `// TODO(frtk)` comment and drop the removed types. `TableType` stays as an optional field that is never set.

## Phase 5: Docs and plans
- Rewrite `.claude/plans/react-conversion/01-franchise-model.md` to this plan, and update the `plan.md` row. Add two roadmap items: FTC overrides and the schema-missing flow.
- `CLAUDE.md` "v5 React UI": replace the `window.api.{general,files,franchise}` bullet. The new text says React uses `window.franchiseAPI` / `window.electronAPI` directly (types in `src/renderer/src/preload.d.ts`) and that `files:*` provides only `getSaves` and `openFolder`.

## Verification
- `npm run test:unit`: xlsx export bytes unchanged after the revert, and the franchiseModel test is gone.
- `npm run typecheck`, `npm run lint`, `npm run test:react`: the `RecentFilesList` snapshot must not change.
- `rg "window\.api\b|franchise-model:" src preload main`: no matches.
- `npm run dev:react`, then:
  - Open `tests/data/m22/career/CAREER-M22TEST` (use a temp copy) and check it appears in recent files.
  - Open the table editor, switch tables, flip the orientation, and filter the sidebar.
  - Export one table to xlsx and one to csv, then reload the renderer (Ctrl+R) to check that the active file is restored.
- `npm run e2eTest`: v4 regression, which should be unaffected because main is back at HEAD.
- Review the diff against this plan.
