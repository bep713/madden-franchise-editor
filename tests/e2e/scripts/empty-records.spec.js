const path = require("path");
const fs = require("fs/promises");
const { expect } = require("chai");
const { test } = require("@playwright/test");

const electron = require("../util/Electron");
const FilePaths = require("../util/FilePaths");
const TestUtil = require("../util/TestUtil");

const App = require("../models/App");
const WelcomePage = require("../models/WelcomePage");
const TableEditorPage = require("../models/TableEditorPage");
const ReferenceEditorModal = require("../models/ReferenceEditorModal");

test.beforeAll(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

test("empty records e2e test", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();

  // can open the table editor
  await welcome.openFranchiseFile(FilePaths.m22.career.test);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);

  await tableEditor.openTableById(4097);

  /** can empty the selected row */
  await tableEditor.selectCellAt(3, 0);
  await tableEditor.setSelectedRecordToEmpty();
  let cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("00000000000000000000000000010101"); // should equal 21 - the table capacity, because there are no other empty records in the table.
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;

  await tableEditor.selectCellAt(3, 1);
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;

  /** can set another cell to empty. The new cell will point to 21 and the old cell should point to the new cell. */
  await tableEditor.selectCellAt(6, 0);
  await tableEditor.setSelectedRecordToEmpty();
  cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("00000000000000000000000000010101"); // should equal 21 - the table capacity, because there are no other empty records in the table.
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;

  await tableEditor.selectCellAt(3, 0);
  cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("00000000000000000000000000000110"); // should update to point to cell 6.
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;

  /** can un-empty the second cell. The first cell pointer should change back to 21. */
  await tableEditor.selectCellAt(6, 0);
  await tableEditor.openEditReferenceModalAtSelectedCell();
  const referenceEditor = new ReferenceEditorModal(window);
  await referenceEditor.setTableReferenceById(4097);
  await referenceEditor.setRowIndex(0);
  await referenceEditor.clickChangeReferenceButton();
  await referenceEditor.close();
  cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("OverallPercentage - 0");
  expect(await tableEditor.isSelectedCellEmpty()).to.be.false;

  await tableEditor.selectCellAt(3, 0);
  cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("00000000000000000000000000010101"); // back to 21
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;

  /** Ensure auto-unempty setting works */
  await TestUtil.setAutoUnempty(app, true);
  await tableEditor.selectCellAt(3, 1);
  await tableEditor.setTextAtSelectedCell("HB");
  await tableEditor.selectCellAt(3, 1); // re-select the cell to avoid locator error
  expect(await tableEditor.isSelectedCellEmpty()).to.be.false;
  await tableEditor.selectCellAt(3, 0);
  expect(await tableEditor.isSelectedCellEmpty()).to.be.false;
  expect(await tableEditor.getTextAtSelectedCell()).to.equal(
    "00000000000000000000000000000000",
  );

  /** Ensure auto-unempty does NOT happen when setting is false */
  await TestUtil.setAutoUnempty(app, false);
  await tableEditor.setSelectedRecordToEmpty();
  await tableEditor.selectCellAt(3, 1);
  await tableEditor.setTextAtSelectedCell("WR");
  await tableEditor.selectCellAt(3, 1); // re-select the cell to avoid locator error
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;
  await tableEditor.selectCellAt(3, 0);
  expect(await tableEditor.isSelectedCellEmpty()).to.be.true;
  expect(await tableEditor.getTextAtSelectedCell()).to.equal(
    "00000000000000000000000000010101",
  );
});
