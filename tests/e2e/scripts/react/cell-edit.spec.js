const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
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

let app;
let electronApp;
let headerNames;

test.beforeEach(TestUtil.overwriteTestCareer);
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});
test.afterAll(TestUtil.overwriteTestCareer);

async function openPlayerTable(preferences) {
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences,
  });
  app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(PLAYER_TABLE_ID);
  const player = await app.readTable(PLAYER_TABLE_ID, ["LastName"]);
  headerNames = player.headers.map((header) => header.name);
  return tableEditor;
}

// Saves, closes the app and opens the file again, so data is read from disk
async function saveAndReopenPlayerTable() {
  await app.saveFile();
  await electronApp.close();
  return openPlayerTable();
}

async function goToCell(tableEditor, row, fieldName) {
  await tableEditor.grid.selectCell(row, fieldName, headerNames);
}

async function readPlayerColumn(fieldName) {
  const table = await app.readTable(PLAYER_TABLE_ID, [fieldName]);
  return table.records.map((record) => record[fieldName]);
}

async function readEmptyPlayerRows() {
  const table = await app.readTable(PLAYER_TABLE_ID, ["LastName"]);
  return table.emptyRecordIndices;
}

// One value per line pastes down a single column
async function pasteColumn(tableEditor, values) {
  await app.copyToClipboard(values.join("\n"));
  await tableEditor.watchForLoader();
  await tableEditor.grid.paste();
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

  // the app still responds to input after the paste. Row 2499 is too far to
  // reach with the arrow keys (no jump to column yet, 03d).
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
  // Reaching rows 373-427 takes a few thousand arrow key presses
  test.setTimeout(120 * 1000);
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
