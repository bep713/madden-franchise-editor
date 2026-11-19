# 03c — Import / export parity

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Builds on [03a-cell-editing.md](03a-cell-editing.md) and [03t-navigation-tabs.md](03t-navigation-tabs.md).

## Goal
Every v4 import/export command works in the React table editor, through the IPC that already exists. No main-process or preload changes.

| Command | v4 trigger | v4 code | IPC (`electronAPI.externalData.*`) | React today |
|---|---|---|---|---|
| Export table (xlsx/csv/…) | File > Export, Ctrl+E (`export-file`) | `ExternalDataHandler.exportTable` | `export(filePath, headers, rows)` | Action-bar button only (`FieldEditorView`), no menu, no open-after-export |
| Import table (xlsx/csv/…) | File > Import, Ctrl+I (`import-file`) | `importTable` | `import(filePath)` → rows, then `importBulk(fileId, tableId, rows)` | Button exists, does nothing |
| Export raw table (`.dat`) | Tools > Export Raw Table (`export-raw-table`) | `exportRawTable` | `rawExport(fileId, tableId, filePath)` | None |
| Export FRT file (`.frt`, whole unpacked file) | Tools > Export FRT File (`export-frt`) | `exportRawFrtk` | `frtExport(fileId, filePath)` | None |
| Import raw table (`.dat`) | Tools > Import Raw Table (`import-raw-table`) | `importRawTable` | `rawImport(fileId, tableId, filePath)` | None |
| Log table to console | Tools, Ctrl+L (`log-table`) | `TableEditorWrapper._onLogTable` | none | None |
| Copy table unique ID | Tools, Ctrl+U (`copy-unique-id`) | `_onCopyUniqueId` | none (`navigator.clipboard`) | None |

The last two aren't import/export, but they are the rest of the Tools menu that the table editor enables, and they take the same menu wiring. They're in scope unless you say otherwise (see Decisions).

v4 references:
- `renderer/js/services/table-editor/ExternalDataHandler.js`: dialogs, filters, loader, title events, error boxes, reload after import.
- `renderer/js/services/externalDataService.js`: export rows are `table.headers.map(name)` × `record[h] ?? ""`.
- `renderer/js/services/table-editor/TableEditorWrapper.js:120-200`: menu channel listeners.
- `main.js:141-262` (menu items; main sends the channel to the renderer), `main.js:584-606` (`exporting` / `exported` / `export-error` / `importing` / `imported` set the window title).
- `main/handlers/externalDataHandler.js`: all five handlers. `import-bulk` saves when `saveOnChange` is on; `import-raw` doesn't save.
- v4's table editor has no Import/Export buttons, only the menus. React keeps its action-bar buttons as well.

## Design

### Shared logic (`src/renderer/src/routes/TableEditor/externalData.ts`, new)
Plain functions, no React, so they're easy to unit test:
- `SPREADSHEET_FILTERS` (v4's 7 entries: xlsx, csv, xlsm, xlsb, xls, ods, txt), `RAW_TABLE_FILTERS` (`dat`; the import adds `'*'` as v4 does), `FRT_FILTERS` (`frt`).
- `getExportData(table: TableData): { headers: string[]; rows: unknown[][] }`: moved from `FieldEditorView` without changes (same as v4's `exportTableData`).
- `errorMessage(error: unknown): string`: `(error as Error)?.message || String(error)`, the same fallback `useCellWrites` uses.

### Command hook (`src/renderer/src/routes/TableEditor/useTableDataCommands.ts`, new)
```ts
interface TableDataCommandContext {
    fileId: string;
    table: TableData;               // the loaded table (selectedTableData)
    isExpressionTable: boolean;
    reloadTable: () => Promise<void>;
    setLoaderOptions: LoaderOptionsSetter;
}
export type TableDataCommand =
    | 'export' | 'import' | 'exportRawTable' | 'exportFrt' | 'importRawTable'
    | 'logTable' | 'copyUniqueId';
export default function useTableDataCommands(
    getContext: () => TableDataCommandContext | null
): (command: TableDataCommand) => Promise<void>;
```
- `getContext` is read at call time (the `latest`-ref pattern from `useFileMenuCommands`), so the returned `run` function is stable and the menu listeners are only added once.
- **Menu listeners**: `export-file`, `import-file`, `export-raw-table`, `export-frt`, `import-raw-table`, `log-table`, `copy-unique-id` → `run(...)`. The cleanup uses `removeAllListeners` per channel, like `useFileMenuCommands` (v4's renderer isn't loaded in React mode, so React is the only listener).
- **Busy guard**: a ref flag. A command that arrives while another is running (for example Ctrl+E pressed twice) is ignored. Cleared in `finally`.
- No context (no table loaded yet) → no-op.
- Every command follows v4's flow:
  1. Show the dialog (`showSaveDialog` / `showOpenDialog`). Use the same titles as v4. `defaultPath: table.name` for the spreadsheet and raw-table saves (React already does this for export), none for FRT. Stop if `canceled` or there's no path.
  2. `setLoaderOptions({ message: 'Exporting...' | 'Importing...', show: true })`, then wait for the loader to paint (double rAF, as v4 and `useCellWrites` do).
  3. `electronAPI.send('exporting' | 'importing')` so main sets the window title (parity).
  4. Call the IPC.
  5. On success, `send('exported' | 'imported')`. Imports then `await reloadTable()`.
  6. On error, `console.error`, `send('export-error' | 'import-error')` (main has no `import-error` listener, which is harmless and matches v4), then `showMessageBox({ type: 'error', title: 'Unable to export' | 'Unable to import', message, detail? })`. Messages:
     - spreadsheet export: v4's "…currently open in another program…" text, with `detail: errorMessage(error)` added. v4 drops the real error, so this is better than parity.
     - everything else: v4's text with `errorMessage(error)` inlined.
  7. Hide the loader in `finally`.
- **Spreadsheet export** also runs v4's open-after-export: after success, if `(await electronAPI.preferences.getValue('general.openExcelAfterImport'))?.[0]` is truthy, `electronAPI.send('open-path', filePath)`. The preference defaults to `[true]`, so specs must turn it off first (v4's `export.spec.js` does).
- **Spreadsheet import**: `externalData.import(path)` → rows, then `importBulk(fileId, table.tableId, rows)`, then reload. Rows past the table's record count are ignored by main (v4 behaviour, unchanged).
- **Raw import**: `rawImport(fileId, table.tableId, path)`, then reload.
- **FRT export**: `frtExport(fileId, path)`. It doesn't use the table.
- **Expression (SPEX) tables**: `export` / `import` are no-ops when `isExpressionTable` (the `TODO(frtk)` in `ExpressionEditorView` stays; no SPEX tables are produced yet). Raw table, FRT, log and copy work for any table.
- **`logTable`**: `console.log(table)`. **`copyUniqueId`**: `navigator.clipboard.writeText(String(table.uniqueId))`, with a `console.warn` when it's missing, as v4 does. v4 reads `header.uniqueId`; React's `TableData.uniqueId` is the same value.

### Wiring (`TableEditor.tsx`)
- `reloadTable`: `onSelectTableRef.current(selectedTable, saved.selection, { force: true, scroll: saved.scroll })`, where `saved = getViewState(activeKeyRef.current)`. The grid comes back on the same cell and scroll position, with fresh `cellErrors` / `emptyRecordIndices`. v4 reloads too (`loadTableById`). The undo stack is cleared, same as v4.
- `const runTableCommand = useTableDataCommands(() => fileId && selectedTable && selectedTableData ? {…} : null)`.
- Pass `onExport={() => runTableCommand('export')}` / `onImport` to `FieldEditorView` as stable callbacks (`useCallback` on the stable `runTableCommand`).

### `FieldEditorView.tsx`
- Remove the inline export code (dialog, `getExportData` body, loader, error box). Add `onExport` / `onImport` props. `handleActionClick` maps `EXPORT` / `IMPORT` to them.

### Menu state (`hooks/useMenuState.ts`)
- `REACT_MENU_IDS = ['Save', 'Export', 'Import', 'ExportRawTable', 'ExportFRT', 'ImportRawTable', 'LogTable', 'CopyUniqueId']`. `navigation.ts` already enables these on `/table-editor` and disables them elsewhere, so nothing else changes. Remove the "Later steps add Export, Import, ..." comment.

### Types (`src/renderer/src/preload.d.ts`)
Add to `electronAPI.externalData`, matching `preload/franchisePreload.js:253-265`:
- `import(filePath): Promise<Record<string, unknown>[]>`
- `importBulk(fileId, tableId, rows): Promise<{ success: boolean }>`
- `rawExport(fileId, tableId, filePath): Promise<void>`
- `frtExport(fileId, filePath): Promise<void>`
- `rawImport(fileId, tableId, filePath): Promise<void>`

## Edge cases
- Export uses `table.records` from the loaded `TableData`. The grid passes those record objects to Handsontable as `data` (`TableEditorComponent.tsx:256`), so cell edits update them in place and the export includes edits that haven't been saved. Same as v4.
- Inverted (switch orientation) view: export/import use `TableData`, not the grid, so orientation doesn't matter. The reload keeps the current orientation, because `FieldEditorView` isn't remounted (it has no `key`).
- The user switches tabs during an import: `reloadTable` goes through `onSelectTable`, whose `loadIdRef` check already drops stale loads. The reload reloads the table in the active tab, which might not be the imported table. To avoid that, `reloadTable` captures the tab key and table when the command starts, and only reloads if the active tab key is unchanged. Otherwise the imported tab reloads anyway when it's activated (tab activation always forces a load).
- Cancelled dialogs: no loader, no title events, no IPC.
- Main wraps invoke errors (`Error invoking remote method …: Error: Failed to …`). Show `error.message` as it is, like `useFileMenuCommands`.
- Accelerators (Ctrl+E, Ctrl+I, Ctrl+L, Ctrl+U) only fire while the menu item is enabled, so they follow `useMenuState`. Handsontable doesn't bind these keys.

## Tests

vitest:
- `routes/TableEditor/externalData.test.ts`: `getExportData` (headers in order, `null`/`undefined` → `''`, edited record values included).
- `routes/TableEditor/useTableDataCommands.test.tsx` (mocked `window.electronAPI`):
  - export: cancel → no IPC, no loader. Success → `externalData.export(path, headers, rows)`, `exporting`/`exported` sent, loader shown then hidden. `open-path` is sent only when the preference is `[true]`. Error → `export-error`, error box, loader hidden.
  - import: `import` → `importBulk(fileId, tableId, rows)` → `reloadTable` once. Error → no reload, error box.
  - raw export/import and FRT export call the right IPC with the right args. Raw import reloads.
  - The menu channels are registered on mount and removed on unmount. A channel event runs its command.
  - Busy guard: a second command while the first dialog is pending is ignored.
  - SPEX: `export` / `import` make no IPC calls. `exportRawTable` still works.
  - No context → no-op.
  - `copyUniqueId` writes the id to a mocked `navigator.clipboard`.
- `hooks/useMenuState.test.tsx`: update the first test. The table editor with a file now enables all the ids above. Without a file, all of them are disabled.
- Update `FieldEditorView` snapshots/tests, if any, after the props change.

e2e (read the "Testing rule" in [02-react-e2e.md](02-react-e2e.md)):
- `tests/e2e/util/dialogStubs.js`: no change (`stubOpenDialog` / `stubSaveDialog` already exist).
- `tests/e2e/models/App.js`: add `isMenuItemEnabled(id)` (`this.app.evaluate(({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).enabled, id)`).
- `tests/e2e/models/react/TableEditorPage.js`:
  - `exportTable(electronApp, filePath, { via = 'button' } = {})`: `'menu'` clicks the `Export` menu item through `App._clickMenuItem` (keep the existing signature for the button).
  - `importTable(electronApp, filePath, { via })`: `stubOpenDialog`, `watchForLoader`, click `[data-action="IMPORT"]` or the `Import` menu item, `waitForLoaderToShowAndHide`, `waitForTableToLoad`.
  - `exportRawTable(electronApp, filePath)`, `exportFrt(electronApp, filePath)`, `importRawTable(electronApp, filePath)` through the menu items (`ExportRawTable`, `ExportFRT`, `ImportRawTable`). The menu click needs an `App`, so pass one in or build it from `electronApp` (`new App(electronApp)`).
- `tests/e2e/scripts/react/export.spec.js` (extend; remove the stale "no React UI yet (03b)" comment):
  - Turn off open-after-export first (`TestUtil.setAutoOpenExcel(app, false)`; the settings window is still v4 and works under React).
  - Assert `Export`, `Import`, `ExportRawTable`, `ExportFRT`, `ImportRawTable` are enabled in the table editor.
  - 4097 xlsx via the button (existing). Then raw table → `fileCompare(rawTable.test, rawTable.overallPercentage)`. Then FRT → `fileCompare(frtk.test, frtk.compare)`. Then 4220 via the **menu** (`via: 'menu'`) → `xlsxCompare(…, exports.player)`. That's v4's `export.spec.js` order and fixtures.
- `tests/e2e/scripts/react/import.spec.js` (new, port of v4 `import.spec.js`, both tests):
  - v4's `jumpToColumn(col, row)` becomes `grid.selectCell(row, col, columnNames)`, with `columnNames` from `app.readTable(id).headers` (the `save.spec.js` pattern; 03d isn't done).
  - Same fixtures, tables, and expected values: 4097 `Spline - 1` / `QB`, 7482 `LongName` row 5 `TEST`, `SalCapNextYearSalaryReserve` row 6 `500`, `TeamRegressionOccurred` row 43 `true`, 4104 `Name` row 1 and `STADIUM_AIRPORTCODE` row 2. Then save + close + reopen (`app.saveFile`, `app.closeFile`), auto-save on 4712 `HasFantasyRoster`, raw import of 4097 (`Spline - 10`, `FS`, `Spline - 11`), and the auto un-empty test.
  - Use both triggers: the action-bar button for 4097/7482, the menu item for 4104/4712.
  - The reference text format (`<table> - <row>`) already matches v4's (`Grid.getTextAtSelectedCell` comment), so the expected strings carry over. If one really differs, follow 02's rule (`test.fixme` and a comment), and don't change fixtures.
- v4 specs are unchanged.

## Verification
`npm run typecheck`, `npm run lint`, `npm run test:react`, `npm run build:react`, `npx playwright test --project=react tests/e2e/scripts/react/export.spec.js tests/e2e/scripts/react/import.spec.js`, then the whole `--project=react` suite (the menu-state change affects every page).

Docs: in [03-table-editor-parity.md](03-table-editor-parity.md), set the 03c row to this plan and its status. In [02-react-e2e.md](02-react-e2e.md), update the `export.spec.js` / `import.spec.js` rows and the "React's export never opens Excel" note.

## Decisions (to confirm)
- **Tools > Log Table / Copy Unique ID are in scope**, since they share the menu wiring and are a few lines each. Drop them if you want 03c to be import/export only.
- Raw table / FRT / raw import are **menu-only**, like v4. The action bar keeps only Export and Import (no new buttons).
- React's export keeps `defaultPath: table.name` (v4 has none), and uses it for the raw-table export as well.
- The spreadsheet export error shows v4's "open in another program" text plus the real error as `detail`.
- Open-after-export (`general.openExcelAfterImport`) is honoured, which differs from 02's note that React never opens Excel. The React export spec now turns it off, as v4's does.
