# Export and import

From the table editor, a user exports the current table to Excel (`.xlsx`), as a raw table (`.dat`) or as an FRT file. They can also import an Excel or raw file back into the table, which then reloads with the imported values.

## Sub-features

- `export-xlsx` uses the action bar's "Export" button (`[data-action="EXPORT"]`) or File > Export (menu id `Export`).
- `export-raw` uses Tools > Export Raw Table (menu id `ExportRawTable`).
- `export-frt` uses Tools > Export FRT File (menu id `ExportFRT`).
- `import-xlsx` uses the action bar's "Import" button (`[data-action="IMPORT"]`) or File > Import (menu id `Import`).
- `import-raw` uses Tools > Import Raw Table (menu id `ImportRawTable`).

## How to get to it (user POV)

- Open a table in the table editor, then use the action bar's Export or Import button.
- Use the File and Tools menus, which are enabled only while the table editor is showing.

## Driving it with drive.js

Preconditions:

- Run with `--prefs '{"general":{"openExcelAfterImport":[]}}'`, so the app doesn't launch Excel.
- A file is open in the table editor (see [table-editor](./table-editor.md)).

- **Menu state.** `app.isMenuItemEnabled(id)` is `true` for `Export`, `Import`, `ExportRawTable`, `ExportFRT` and `ImportRawTable`.
- **Export xlsx.** Call `await models.tableEditor.openTableById(4097)`, then `await models.tableEditor.exportTable(electronApp, sandbox.exportPath)` (pass `{ via: "menu" }` for File > Export). Wait for the file with `e2e("util/FileCompare.js").waitForFile(sandbox.exportPath)`, then compare with `xlsxCompare(sandbox.exportPath, e2e("util/FilePaths.js").m22.exports.overallPercentage)`, and run `keep(sandbox.exportPath)`.
- **Export raw.** Call `await models.tableEditor.exportRawTable(electronApp, sandbox.rawExportPath)`, then `waitForFile`, compare with `fileCompare` against `FilePaths.m22.exports.rawTable.overallPercentage`, and run `keep()`.
- **Import xlsx.** Call `await models.tableEditor.importTable(electronApp, FilePaths.m22.imports.overallPercentage)`. This returns after the table reloads. Take `shot("after-import")`, then save and read the table back with `readSavedTable`. The expected cell values are in `tests/e2e/scripts/react/import.spec.js`.
- **Import raw.** Call `await models.tableEditor.importRawTable(electronApp, FilePaths.m22.imports.rawTable.overallPercentage)`. Cell (0,0) reads `Spline - 10` and cell (0,1) reads `FS`.

## Gotchas

- `exportTable` returns before the file is written. Always `waitForFile`.
- Export paths are in the sandbox, which is deleted at the end of the run. `keep()` any export you want as evidence.
- Import fixtures (`FilePaths.m22.imports.*`) are read-only inputs. Never write to them.
- These flows are tagged `@slow` in e2e and take 15 s or more each, so budget accordingly.
