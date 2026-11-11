const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const { FranchiseFile } = require("madden-franchise");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

// Port of bulk-edit.spec.js's grid tests. The Player table is the largest
// table in the test file (3960 rows, ~1000 of them empty).
const PLAYER_TABLE_ID = 4220;
const FIRST_EMPTY_PLAYER_ROWS = [373, 374, 375, 376];
const NEXT_EMPTY_PLAYER_ROW = 427;
const MAX_BULK_PASTE_MS = 15000;
const FILE_POLL_OPTIONS = { timeout: 30000 };
const AUTO_UNEMPTY = { general: { autoUnempty: [true] } };
const AUTO_SAVE = { general: { autoSave: [true] } };

let app;
let electronApp;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});

async function openPlayerTable(preferences) {
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences,
  });
  app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(PLAYER_TABLE_ID);
  return tableEditor;
}

// Saves, closes the app and opens the file again, so data is read from disk
async function saveAndReopenPlayerTable() {
  await app.saveFile();
  await electronApp.close();
  return openPlayerTable();
}

async function goToCell(tableEditor, row, fieldName) {
  await tableEditor.jumpToColumn(fieldName, row);
}

async function readPlayerColumn(fieldName) {
  const table = await app.readTable(PLAYER_TABLE_ID, [fieldName]);
  return table.records.map((record) => record[fieldName]);
}

// Parses the file on disk in the test process, not the app's in-memory copy.
// Returns null while the file can't be parsed (mid-write).
async function readPlayerFieldFromDisk(fieldName, row) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-disk-read-"));
  try {
    const file = await FranchiseFile.create(careerPath, {
      schemaDirectory: tmpDir,
      saveOnChange: false,
    });
    const table = file.getTableById(PLAYER_TABLE_ID);
    await table.readRecords();
    return table.records[row][fieldName];
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function readEmptyPlayerRows() {
  const table = await app.readTable(PLAYER_TABLE_ID, ["LastName"]);
  return table.emptyRecordIndices;
}

// One value per line pastes down a single column
async function pasteColumn(tableEditor, values) {
  await tableEditor.watchForLoader();
  await app.pasteText(tableEditor.window, values.join("\n"));
}

test("single-cell edits are saved to the file (react)", async () => {
  const tableEditor = await openPlayerTable();

  await goToCell(tableEditor, 0, "LastName");
  await tableEditor.grid.setTextAtSelectedCell("Single");

  await poll(
    async () => (await readPlayerColumn("LastName"))[0],
    (name) => name === "Single",
    { ...FILE_POLL_OPTIONS, message: "The edit never reached the file" },
  );
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Single");
});

test("pasting 2,500 cells stays responsive and shows the loader (react)", async () => {
  // Pasting into empty rows also un-empties them, the most work per cell
  const tableEditor = await openPlayerTable(AUTO_UNEMPTY);

  const lastNames = Array.from({ length: 2500 }, (_, i) => `Bulk${i}`);
  await goToCell(tableEditor, 0, "LastName");

  const start = Date.now();
  await pasteColumn(tableEditor, lastNames);
  await tableEditor.waitForLoaderToShowAndHide();
  expect(Date.now() - start).to.be.below(MAX_BULK_PASTE_MS);

  // the app still responds to input after the paste
  await goToCell(tableEditor, 2499, "LastName");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Bulk2499");
  const firstEmptyRow = FIRST_EMPTY_PLAYER_ROWS[0];
  await goToCell(tableEditor, firstEmptyRow, "LastName");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    `Bulk${firstEmptyRow}`,
  );
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(false);

  // every value made it into the file
  const fileLastNames = await readPlayerColumn("LastName");
  expect(fileLastNames.slice(0, 2500)).to.deep.equal(lastNames);
});

test("pasting into empty rows un-empties them and removes the empty styling (react)", async () => {
  const tableEditor = await openPlayerTable(AUTO_UNEMPTY);

  await goToCell(tableEditor, FIRST_EMPTY_PLAYER_ROWS[0], "LastName");
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(true);

  await pasteColumn(tableEditor, ["Empty1", "Empty2", "Empty3", "Empty4"]);
  await tableEditor.waitForLoaderToShowAndHide();

  // the pasted rows are no longer empty in the grid...
  for (const row of FIRST_EMPTY_PLAYER_ROWS) {
    await goToCell(tableEditor, row, "LastName");
    expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(false);
  }
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Empty4");

  // ...or in the file
  const emptyRows = await readEmptyPlayerRows();
  for (const row of FIRST_EMPTY_PLAYER_ROWS) {
    expect(emptyRows).to.not.include(row);
  }

  // rows that were not pasted into stay empty
  expect(emptyRows).to.include(NEXT_EMPTY_PLAYER_ROW);
  await goToCell(tableEditor, NEXT_EMPTY_PLAYER_ROW, "LastName");
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(true);
});

// Also guards against the grid reloading its data when the loader re-renders
// the page, which would clear the undo stack.
test("undo and redo after a bulk paste are saved to the file (react)", async () => {
  test.setTimeout(180 * 1000); // the file is reopened twice

  // Rows before the first empty row, so undo puts back real names
  const rowCount = FIRST_EMPTY_PLAYER_ROWS[0];
  const pastedNames = Array.from({ length: rowCount }, (_, i) => `Undo${i}`);
  const readPastedRows = async () =>
    (await readPlayerColumn("LastName")).slice(0, rowCount);

  let tableEditor = await openPlayerTable();
  const originalNames = await readPastedRows();

  await goToCell(tableEditor, 0, "LastName");
  await pasteColumn(tableEditor, pastedNames);
  await tableEditor.waitForLoaderToShowAndHide();
  expect(await readPastedRows()).to.deep.equal(pastedNames);

  /** Ctrl+Z puts the original names back, in the grid and in the saved file */
  await tableEditor.watchForLoader();
  await tableEditor.grid.undo();
  await tableEditor.waitForLoaderToShowAndHide();
  await goToCell(tableEditor, 0, "LastName");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    originalNames[0],
  );

  tableEditor = await saveAndReopenPlayerTable();
  expect(await readPastedRows()).to.deep.equal(originalNames);

  /** Ctrl+Y puts the pasted names back, in the grid and in the saved file */
  await goToCell(tableEditor, 0, "LastName");
  await pasteColumn(tableEditor, pastedNames);
  await tableEditor.waitForLoaderToShowAndHide();
  await tableEditor.watchForLoader();
  await tableEditor.grid.undo();
  await tableEditor.waitForLoaderToShowAndHide();
  await tableEditor.watchForLoader();
  await tableEditor.grid.redo();
  await tableEditor.waitForLoaderToShowAndHide();
  await goToCell(tableEditor, 0, "LastName");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    pastedNames[0],
  );

  tableEditor = await saveAndReopenPlayerTable();
  expect(await readPastedRows()).to.deep.equal(pastedNames);
});

test("a paste with one invalid value only reverts that cell (react)", async () => {
  const tableEditor = await openPlayerTable();
  const readStatuses = async () =>
    (await readPlayerColumn("InjuryStatus")).slice(0, 3);
  expect(await readStatuses()).to.deep.equal([
    "Uninjured",
    "Uninjured",
    "Uninjured",
  ]);

  await goToCell(tableEditor, 0, "InjuryStatus");
  await pasteColumn(tableEditor, ["Injured", "NotAStatus", "EarlyReturn"]);
  await tableEditor.waitForLoaderToShowAndHide();

  // the file keeps the valid values and rejects the invalid one
  expect(await readStatuses()).to.deep.equal([
    "Injured",
    "Uninjured",
    "EarlyReturn",
  ]);

  // the grid shows the same thing
  await goToCell(tableEditor, 0, "InjuryStatus");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Injured");
  await goToCell(tableEditor, 1, "InjuryStatus");
  await poll(
    () => tableEditor.grid.getTextAtSelectedCell(),
    (text) => text === "Uninjured",
    { message: "The invalid value was not reverted" },
  );
  await goToCell(tableEditor, 2, "InjuryStatus");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    "EarlyReturn",
  );
});

test("an enum dropdown edit is saved to the file (react)", async () => {
  const tableEditor = await openPlayerTable();

  await goToCell(tableEditor, 0, "InjuryStatus");
  await tableEditor.grid.chooseDropdownOptionAtSelectedCell("Injured");

  await poll(
    async () => (await readPlayerColumn("InjuryStatus"))[0],
    (status) => status === "Injured",
    {
      ...FILE_POLL_OPTIONS,
      message: "The dropdown edit never reached the file",
    },
  );
  await goToCell(tableEditor, 0, "InjuryStatus");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Injured");
});

test("undo doesn't reach into another table (react)", async () => {
  const tableEditor = await openPlayerTable();
  await goToCell(tableEditor, 0, "LastName");
  await tableEditor.grid.setTextAtSelectedCell("BeforeSwitch");
  await poll(
    async () => (await readPlayerColumn("LastName"))[0],
    (name) => name === "BeforeSwitch",
    { ...FILE_POLL_OPTIONS, message: "The edit never reached the file" },
  );

  // Ctrl+Z in another table changes nothing there, or in the first table
  const TEAM_TABLE_ID = 7482;
  const before = await app.readTable(TEAM_TABLE_ID);
  await tableEditor.openTableById(TEAM_TABLE_ID);
  await tableEditor.grid.selectCellAt(0, 0);
  await tableEditor.grid.undo();
  // a write would take this long to reach the file
  await new Promise((resolve) => setTimeout(resolve, 1000));
  expect((await app.readTable(TEAM_TABLE_ID)).records).to.deep.equal(
    before.records,
  );
  expect((await readPlayerColumn("LastName"))[0]).to.equal("BeforeSwitch");
});

// Regression: a write that arrived during an auto-save was never saved, and
// its response could land before the earlier write's, flickering the grid
test("fast edits and a fast double undo with autoSave reach the grid and the disk (react)", async () => {
  const tableEditor = await openPlayerTable(AUTO_SAVE);

  // Once every queued save is done, the grid, main's copy and the file on
  // disk all hold `value`
  const expectSettled = async (value) => {
    await poll(
      () => tableEditor.grid.getTextAtSelectedCell(),
      (text) => text === String(value),
      { message: `The grid never showed ${value}` },
    );
    await new Promise((resolve) => setTimeout(resolve, 3000));
    expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
      String(value),
    );
    expect((await readPlayerColumn("JerseyNum"))[0]).to.equal(value);
    const onDisk = await poll(
      () => readPlayerFieldFromDisk("JerseyNum", 0),
      (diskValue) => diskValue !== null,
      { ...FILE_POLL_OPTIONS, message: "The file on disk couldn't be read" },
    );
    expect(onDisk).to.equal(value);
  };

  // the second edit arrives while the first one is saving
  await goToCell(tableEditor, 0, "JerseyNum");
  await tableEditor.grid.setTextAtSelectedCell("5");
  await tableEditor.grid.setTextAtSelectedCell("6");
  await expectSettled(6);

  await tableEditor.grid.setTextAtSelectedCell("7");
  await expectSettled(7);

  // two quick Ctrl+Z presses
  await tableEditor.grid.undo();
  await tableEditor.grid.undo();
  await expectSettled(5);
});
