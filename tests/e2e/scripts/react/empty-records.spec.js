const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");
const {
  readTableFromDisk,
  readSavedTable,
} = require("../../util/diskReader");

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

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});

async function openTable(preferences) {
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

  /** the file has both, and keeps them after a save */
  await waitForEmptyRows([3, 6]);
  await app.saveFile();
  expect(
    (await readSavedTable(careerPath, TABLE_ID)).emptyRecordIndices,
  ).to.deep.equal([3, 6]);

  /** can un-empty the second cell. The first cell pointer changes back to 21 */
  await grid.selectCellAt(6, 0);
  await grid.editReferenceAtSelectedCell();
  const referenceEditor = new ReferenceEditor(tableEditor.window);
  await referenceEditor.waitForOpen();
  await referenceEditor.setTableById(TABLE_ID);
  await referenceEditor.setRowIndex(0);
  await referenceEditor.change();
  await referenceEditor.close();
  await waitForCellText(grid, "OverallPercentage - 0");
  expect(await grid.isSelectedCellEmpty()).to.equal(false);

  await grid.selectCellAt(3, 0);
  await waitForCellText(grid, CAPACITY_POINTER);
  expect(await grid.isSelectedCellEmpty()).to.equal(true);
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
  // read before anything is saved, so this is the pristine record
  const originalOnDisk = (await readTableFromDisk(careerPath, TABLE_ID))
    .records[6];
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

  /** undo once more, then the restored row 6 is in the saved file */
  await grid.undo();
  await waitForEmptyRows([3]);
  await grid.selectCellAt(6, 0);
  await waitForCellText(grid, original["6,0"]);
  expect(await grid.isSelectedCellEmpty()).to.equal(false);
  await grid.selectCellAt(6, 1);
  expect(await grid.getTextAtSelectedCell()).to.equal(original["6,1"]);
  await app.saveFile();
  const saved = await readSavedTable(careerPath, TABLE_ID);
  expect(saved.emptyRecordIndices).to.deep.equal([3]);
  expect(saved.records[6]).to.deep.equal(originalOnDisk);
});
