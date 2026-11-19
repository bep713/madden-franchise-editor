const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

test("jump to column (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);
  const { grid, jumpToColumnModal: modal } = tableEditor;

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(7482);

  const team = await app.readTable(7482);
  const longNameAt = (row) => String(team.records[row].LongName);

  // the row is prefilled with the selected row, and X reselects that cell
  await grid.selectCellAt(10, 0);
  const firstCellText = await grid.getTextAtSelectedCell();
  await tableEditor.openColumnJumpModal();
  expect(await modal.getRowIndex()).to.equal("10");
  await modal.close();
  expect(await grid.getTextAtSelectedCell()).to.equal(firstCellText);

  // Ctrl+J opens it with the column search focused; one Enter picks the
  // first match and jumps
  await window.keyboard.press("Control+J");
  await modal.waitForOpen();
  await window.keyboard.type("longn");
  await window.keyboard.press("Enter");
  await modal.waitForClose();
  expect(await grid.getTextAtSelectedCell()).to.equal(longNameAt(10));

  // Esc closes it and selects the previous cell again
  await window.keyboard.press("Control+J");
  await modal.waitForOpen();
  await window.keyboard.type("short");
  await window.keyboard.press("Escape");
  await modal.waitForClose();
  expect(await grid.getTextAtSelectedCell()).to.equal(longNameAt(10));

  // a row that isn't a number is row 0
  await tableEditor.jumpToColumn("LongName", "abc");
  expect(await grid.getTextAtSelectedCell()).to.equal(longNameAt(0));

  // the inverted view jumps to the same record and field
  await tableEditor.switchOrientation();
  await tableEditor.jumpToColumn("LongName", 52);
  expect(await grid.getTextAtSelectedCell()).to.equal("New York");

  await electronApp.close();
});
