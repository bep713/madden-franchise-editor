const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const ReferenceEditor = require("../../models/react/ReferenceEditor");

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

const headerNames = (table) => table.headers.map((header) => header.name);

// Port of the reference part of smoke.spec.js
test("follow and edit references (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();

  // a reference shows as "<table> - <row>"
  await tableEditor.openTableById(7482);
  const team = await app.readTable(7482);
  await tableEditor.grid.selectCell(43, "Stadium", headerNames(team));
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    "Stadium - 12",
  );

  // clicking it opens that table at that row
  await tableEditor.grid.followReferenceAtSelectedCell();
  await poll(
    () => tableEditor.getSelectedTableName(),
    (name) => name === "4104 - Stadium",
    { message: "The reference was not followed" },
  );
  await tableEditor.waitForTableToLoad();
  const selectedRowHeader = window.locator(
    ".ht_clone_inline_start tbody th.ht__highlight",
  );
  await poll(
    () => selectedRowHeader.first().innerText(),
    (text) => text.trim() === "12",
    { message: "Row 12 was not selected" },
  );

  // the reference editor shows the parsed reference
  const stadium = await app.readTable(4104);
  await tableEditor.grid.selectCell(18, "BathroomInfo", headerNames(stadium));
  await tableEditor.grid.editReferenceAtSelectedCell();

  const referenceEditor = new ReferenceEditor(window);
  await referenceEditor.waitForOpen();
  expect(await referenceEditor.getSelectedTable()).to.equal(
    "4141 - StadiumPartInfo",
  );
  expect(await referenceEditor.getRowIndex()).to.equal("18");
  expect(await referenceEditor.getBinary()).to.equal(
    "00100000010110100000000000010010",
  );

  // the caret toggles the table options, which scroll and overlay the editor
  // without growing it; an outside click closes them
  const closedHeight = await referenceEditor.getHeight();
  await referenceEditor.toggleTableOptions();
  expect(await referenceEditor.areTableOptionsOpen()).to.equal(true);
  expect(await referenceEditor.isTableOptionListScrollable()).to.equal(true);
  expect(await referenceEditor.getHeight()).to.equal(closedHeight);
  await referenceEditor.toggleTableOptions();
  expect(await referenceEditor.areTableOptionsOpen()).to.equal(false);
  await referenceEditor.toggleTableOptions();
  await referenceEditor.clickTitle();
  expect(await referenceEditor.areTableOptionsOpen()).to.equal(false);

  // the label toggles them too, and opening selects the table text
  await referenceEditor.clickTableLabel();
  expect(await referenceEditor.areTableOptionsOpen()).to.equal(true);
  expect(await referenceEditor.isTableTextSelected()).to.equal(true);
  await referenceEditor.clickTableLabel();
  expect(await referenceEditor.areTableOptionsOpen()).to.equal(false);

  // changing the table and row updates the binary
  await referenceEditor.setTableById(4146);
  await referenceEditor.setRowIndex(25);
  expect(await referenceEditor.getBinary()).to.equal(
    "00100000011001000000000000011001",
  );

  // Change writes the cell; closing selects it again
  await referenceEditor.change();
  await referenceEditor.close();
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    "SeasonGame - 25",
  );
  await poll(
    async () => (await app.readTable(4104, ["BathroomInfo"])).records[18],
    (record) => record.BathroomInfo === "00100000011001000000000000011001",
    { message: "The new reference never reached the file" },
  );

  await electronApp.close();
});
