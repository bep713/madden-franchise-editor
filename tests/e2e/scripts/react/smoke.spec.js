const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const TableEditorPage = require("../../models/react/TableEditorPage");

test.beforeAll(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

test("basic test (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();

  // can open a file
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  expect(await welcome.getStartedTitle()).to.equal("CAREER-E2ETEST");
  const tabs = await nav.tabNames();
  expect(tabs).to.include("Home");
  expect(tabs).to.include("Open Table...");

  // can open the table editor, which loads the first table
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  expect(await tableEditor.getSelectedTableName()).to.equal(
    "4097 - OverallPercentage",
  );
  expect(
    await tableEditor.selectedSidebarTable().getAttribute("data-table-id"),
  ).to.equal("4097");

  // the grid shows the file's data. Compared with IPC data, not a fixed
  // string, so it holds when reference cells get a display format (03d).
  const overallPercentage = await app.readTable(4097);
  const firstHeader = overallPercentage.headers[0].name;
  await tableEditor.grid.selectCellAt(0, 0);
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    String(overallPercentage.records[0][firstHeader]),
  );

  // can open a different table
  await tableEditor.openTableById(7482);
  expect(await tableEditor.getSelectedTableName()).to.equal("7482 - Team");

  // other table data displays properly
  const team = await app.readTable(7482);
  await tableEditor.grid.selectCell(
    52,
    "LongName",
    team.headers.map((header) => header.name),
  );
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("New York");

  // Home tab goes to the welcome page, which lists the file as recent
  await nav.openTab("Home");
  await welcome.waitForPageLoad();
  await welcome.recentFile("CAREER-E2ETEST").waitFor();

  // the table editor tab opens the table editor again
  await nav.openTab("Open Table...");
  await tableEditor.waitForTableToLoad();

  // can reopen the file from Recent Files
  await nav.openTab("Home");
  await welcome.waitForPageLoad();
  const firstFileId = await window.evaluate(() =>
    window.franchiseAPI.getActiveFileId(),
  );
  await welcome.recentFile("CAREER-E2ETEST").click();
  await poll(
    () => window.evaluate(() => window.franchiseAPI.getActiveFileId()),
    (fileId) => fileId && fileId !== firstFileId,
    { message: "The file was not reopened" },
  );
  await welcome.waitForOpenFile(FilePaths.m22.career.test);

  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  expect(await tableEditor.getSelectedTableName()).to.equal(
    "4097 - OverallPercentage",
  );

  await electronApp.close();
});
