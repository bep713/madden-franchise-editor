const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const ReferenceEditor = require("../../models/react/ReferenceEditor");

const TABLE_ID = 4097;
// The table capacity (21), which ends the empty-record chain
const CAPACITY_POINTER = "00000000000000000000000000010101";
const AUTO_UNEMPTY = { general: { autoUnempty: [true] } };

let app;
let electronApp;

test.beforeEach(TestUtil.overwriteTestCareer);
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});
test.afterAll(TestUtil.overwriteTestCareer);

async function openTable(preferences) {
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
  await tableEditor.openTableById(TABLE_ID);
  return tableEditor;
}

async function waitForEmptyRows(expected) {
  return poll(
    async () => (await app.readTable(TABLE_ID)).emptyRecordIndices,
    (rows) => JSON.stringify([...rows].sort((a, b) => a - b)) ===
      JSON.stringify(expected),
    { message: `The file never showed empty rows ${JSON.stringify(expected)}` },
  );
}

// Waits for the selected cell's text, which updates after the write returns
async function waitForCellText(grid, text) {
  await poll(
    () => grid.getTextAtSelectedCell(),
    (actual) => actual === text,
    { message: `The selected cell never showed "${text}"` },
  );
}

async function waitForSelectedCellEmpty(grid, expected) {
  await poll(
    () => grid.isSelectedCellEmpty(),
    (actual) => actual === expected,
    {
      message: `The selected cell never became ${expected ? "" : "non-"}empty`,
    },
  );
}

// Port of the first part of empty-records.spec.js, plus the persisted check
test("empty records can be set, chained and un-emptied (react)", async () => {
  const tableEditor = await openTable();
  const { grid } = tableEditor;

  /** can empty the selected row */
  await grid.selectCellAt(3, 0);
  await tableEditor.setSelectedRecordToEmpty();
  await waitForCellText(grid, CAPACITY_POINTER); // no other empty records
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  await grid.selectCellAt(3, 1);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  /** another empty cell points to 21, the old one points to the new one */
  await grid.selectCellAt(6, 0);
  await tableEditor.setSelectedRecordToEmpty();
  await waitForCellText(grid, CAPACITY_POINTER);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  await grid.selectCellAt(3, 0);
  expect(await grid.getTextAtSelectedCell()).to.equal(
    "00000000000000000000000000000110", // points to row 6
  );
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  /** the file has both, and keeps them after a save and reopen */
  await waitForEmptyRows([3, 6]);
  await app.saveFile();
  await electronApp.close();
  const reopened = await openTable();
  expect((await app.readTable(TABLE_ID)).emptyRecordIndices.sort()).to.deep.equal(
    [3, 6],
  );
  await reopened.grid.selectCellAt(6, 0);
  expect(await reopened.grid.isSelectedCellEmpty()).to.equal(true);

  /** can un-empty the second cell. The first cell pointer changes back to 21 */
  await reopened.grid.editReferenceAtSelectedCell();
  const referenceEditor = new ReferenceEditor(reopened.window);
  await referenceEditor.waitForOpen();
  await referenceEditor.setTableById(TABLE_ID);
  await referenceEditor.setRowIndex(0);
  await referenceEditor.change();
  await referenceEditor.close();
  await waitForCellText(reopened.grid, "OverallPercentage - 0");
  expect(await reopened.grid.isSelectedCellEmpty()).to.equal(false);

  await reopened.grid.selectCellAt(3, 0);
  await waitForCellText(reopened.grid, CAPACITY_POINTER);
  expect(await reopened.grid.isSelectedCellEmpty()).to.equal(true);
  await waitForEmptyRows([3]);
});

test("editing an empty record un-empties it with auto-unempty on (react)", async () => {
  const tableEditor = await openTable(AUTO_UNEMPTY);
  const { grid } = tableEditor;

  await grid.selectCellAt(3, 0);
  await tableEditor.setSelectedRecordToEmpty();
  await waitForCellText(grid, CAPACITY_POINTER);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  await grid.selectCellAt(3, 1);
  await grid.setTextAtSelectedCell("HB");
  await grid.selectCellAt(3, 1); // re-select the cell to avoid locator error
  await waitForSelectedCellEmpty(grid, false);
  await grid.selectCellAt(3, 0);
  expect(await grid.isSelectedCellEmpty()).to.equal(false);
  expect(await grid.getTextAtSelectedCell()).to.equal(
    "00000000000000000000000000000000",
  );
  await waitForEmptyRows([]);
});

test("editing an empty record keeps it empty with auto-unempty off (react)", async () => {
  const tableEditor = await openTable();
  const { grid } = tableEditor;

  await grid.selectCellAt(3, 0);
  await tableEditor.setSelectedRecordToEmpty();
  await waitForCellText(grid, CAPACITY_POINTER);

  await grid.selectCellAt(3, 1);
  await grid.setTextAtSelectedCell("WR");
  await grid.selectCellAt(3, 1); // re-select the cell to avoid locator error
  expect(await grid.isSelectedCellEmpty()).to.equal(true);
  await grid.selectCellAt(3, 0);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);
  expect(await grid.getTextAtSelectedCell()).to.equal(CAPACITY_POINTER);
  await waitForEmptyRows([3]);
});

test("setting records as empty can be undone and redone (react)", async () => {
  const tableEditor = await openTable();
  const { grid } = tableEditor;

  const original = {};
  for (const [row, col] of [[3, 0], [6, 0], [6, 1]]) {
    await grid.selectCellAt(row, col);
    original[`${row},${col}`] = await grid.getTextAtSelectedCell();
  }

  await grid.selectCellAt(3, 0);
  await tableEditor.setSelectedRecordToEmpty();
  await waitForCellText(grid, CAPACITY_POINTER);
  await grid.selectCellAt(6, 0);
  await tableEditor.setSelectedRecordToEmpty();
  await waitForCellText(grid, CAPACITY_POINTER);
  await waitForEmptyRows([3, 6]);

  /** undo takes row 6 out of the chain. Row 3 points to 21 again */
  await grid.undo();
  await waitForEmptyRows([3]);
  await grid.selectCellAt(6, 0);
  await waitForCellText(grid, original["6,0"]);
  expect(await grid.isSelectedCellEmpty()).to.equal(false);
  await grid.selectCellAt(6, 1);
  expect(await grid.getTextAtSelectedCell()).to.equal(original["6,1"]);
  await grid.selectCellAt(3, 0);
  await waitForCellText(grid, CAPACITY_POINTER);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  /** undo again: nothing is empty */
  await grid.undo();
  await waitForEmptyRows([]);
  await grid.selectCellAt(3, 0);
  await waitForCellText(grid, original["3,0"]);
  expect(await grid.isSelectedCellEmpty()).to.equal(false);

  /** redo twice rebuilds the chain 3 -> 6 -> 21 */
  await grid.redo();
  await waitForEmptyRows([3]);
  await grid.redo();
  await waitForEmptyRows([3, 6]);
  await grid.selectCellAt(3, 0);
  await waitForCellText(grid, "00000000000000000000000000000110");
  expect(await grid.isSelectedCellEmpty()).to.equal(true);
  await grid.selectCellAt(6, 0);
  await waitForCellText(grid, CAPACITY_POINTER);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);

  /** undo once more, then the restored row 6 survives a save and reopen */
  await grid.undo();
  await waitForEmptyRows([3]);
  await app.saveFile();
  await electronApp.close();
  const reopened = await openTable();
  expect((await app.readTable(TABLE_ID)).emptyRecordIndices).to.deep.equal([3]);
  await reopened.grid.selectCellAt(6, 0);
  expect(await reopened.grid.getTextAtSelectedCell()).to.equal(original["6,0"]);
  expect(await reopened.grid.isSelectedCellEmpty()).to.equal(false);
  await reopened.grid.selectCellAt(6, 1);
  expect(await reopened.grid.getTextAtSelectedCell()).to.equal(original["6,1"]);
  await reopened.grid.selectCellAt(3, 0);
  expect(await reopened.grid.getTextAtSelectedCell()).to.equal(CAPACITY_POINTER);
});
