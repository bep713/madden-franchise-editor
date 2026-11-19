# Table editor

A user browses every table of an open file in a sidebar, opens one in a Handsontable grid, and edits cells. With auto-save off (the run default), edits stay in memory until File > Save writes the file. Tables can be pinned to the top of the sidebar, and "Jump to column" moves the selection to a given field and row.

## Sub-features

- `open-editor` loads the editor from "Open the table editor", which opens table `4096`.
- `open-table` opens a table from the sidebar search. Its header reads `<id> - <name>`.
- `edit-cell` types a value into a grid cell, and the value is in the open file right away.
- `save` writes the file through File > Save (menu id `Save`, enabled only in the editor).
- `save-as` writes a copy through File > Save As (menu id `SaveAs`) and leaves the original unchanged.
- `jump-to-column` uses the action bar's "Jump to column" to select a field and row.
- `pin` uses the action bar's "Pin" (`[data-action="PIN"]`) to add the table to the sidebar's Pinned section.

## How to get to it (user POV)

- Click "Open the table editor" on the Welcome page's Get Started card.
- Click the `Open Table...` tab, or the `+` (New tab) button.
- Search the sidebar ("Search tables..." box) and click a table card.

## Driving it with drive.js

Preconditions:

- A file is open (see [open-file](./open-file.md)), then `await models.welcome.openTableEditor(); await models.tableEditor.waitForTableToLoad()`.

- **Open table.** Call `await models.tableEditor.openTableById(7482)`. `getSelectedTableName()` returns `7482 - Team`.
- **Select a cell.** Get `headers = (await app.readTable(7482)).headers.map(h => h.name)`, then call `await models.tableEditor.grid.selectCell(52, "LongName", headers)`. `grid.getTextAtSelectedCell()` returns `New York`. Take `shot("before-edit")`.
- **Edit.** Call `await models.tableEditor.grid.setTextAtSelectedCell("Old York")`. The grid shows `Old York`, and so does `(await app.readTable(7482, ["LongName"])).records[52].LongName` (in memory, not yet on disk). Take `shot("after-edit")`.
- **Save.** Record `fs.statSync(sandbox.careerPath).mtimeMs`, call `await app.clickMenuItem("Save")`, and poll until the mtime advances. `(await readSavedTable(sandbox.careerPath, 7482, ["LongName"])).records[52].LongName === "Old York"`.
- **Save As.** Call `stubs.stubSaveDialog(electronApp, <new path in sandbox.dir>)`, then `app.clickMenuItem("SaveAs")`. Poll until the new file exists. `readSavedTable` shows the edit in the copy and `New York` in the original.
- **Jump to column.** Call `await models.tableEditor.jumpToColumn("LongName", 52)`. The selected cell is `New York`.
- **Pin.** Call `await models.tableEditor.togglePinSelectedTable()`. `getPinnedTableIds()` includes `7482`. `pins.json` in the run's userData dir (`e2e("util/Electron.js").userDataDir`) has the table. Read it **inside** the scenario, because the folder is deleted when the run closes.
- **Proven scenario:** `node .claude/skills/verify-mfe/scripts/drive.js .claude/skills/verify-mfe/scenarios/table-edit-save.js` runs open-table, edit-cell and save end to end.

## Gotchas

- Ctrl+S from Playwright doesn't fire the menu accelerator. Use `app.clickMenuItem("Save")`.
- Both the sidebar and the grid are virtualized. Don't look for off-screen rows or columns in the DOM. Use `openTableById` and `selectCell`.
- `app.readTable(4220)` (Player) without `fields` takes about 12 s and can crash the driver. Always pass `fields` for large tables.
- Typing into a reference or enum cell behaves differently: enums open a dropdown (`grid.chooseDropdownOptionAtSelectedCell`), and references have their own editor (`grid.editReferenceAtSelectedCell`, `e2e("models/react/ReferenceEditor.js")`).
- The tab title changes to the table name once a table opens. `nav.tabNames()` shows `7482 - Team`, not `Open Table...`.
