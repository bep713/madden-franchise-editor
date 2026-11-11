const path = require("path");
const fs = require("fs/promises");
const { expect } = require("chai");
const { test } = require("../util/test");

const electron = require("../util/Electron");

const App = require("../models/App");
const WelcomePage = require("../models/WelcomePage");
const TableEditorPage = require("../models/TableEditorPage");
const ReferenceEditorModal = require("../models/ReferenceEditorModal");

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

test("back button e2e test", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();

  // can open the table editor
  await welcome.openFranchiseFile(careerPath);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForSelectedTable();

  // Can go back one table
  await tableEditor.openTableById(7482);
  await tableEditor.clickBackButton();

  let tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal("4097 - OverallPercentage");

  // can go back after clicking on a reference
  await tableEditor.followSelectedCellReference();
  await tableEditor.clickBackButton();
  tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal("4097 - OverallPercentage");

  // can go back to the specific cell that you were on
  await tableEditor.selectCellAt(5, 0);
  await tableEditor.followSelectedCellReference();
  await tableEditor.clickBackButton();
  let cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("Spline - 5");

  // can go back multiple tables and cells
  await tableEditor.followSelectedCellReference();
  await tableEditor.selectCellAt(5, 1);
  await tableEditor.followSelectedCellReference();
  await tableEditor.clickBackButton();
  tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal("7022 - Spline");
  cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("int[] - 10");

  await tableEditor.clickBackButton();
  tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal("4097 - OverallPercentage");
  cellText = await tableEditor.getTextAtSelectedCell();
  expect(cellText).to.equal("Spline - 5");
});
