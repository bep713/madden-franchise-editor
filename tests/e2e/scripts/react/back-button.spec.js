const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

async function waitForTable(tableEditor, name) {
  await poll(
    () => tableEditor.getSelectedTableName(),
    (selected) => selected === name,
    { message: `${name} never loaded` },
  );
  await tableEditor.waitForTableToLoad();
}

async function waitForCellText(tableEditor, text) {
  await poll(
    () => tableEditor.grid.getTextAtSelectedCell(),
    (actual) => actual === text,
    { message: `The selected cell never showed "${text}"` },
  );
}

async function waitForBackEnabled(tableEditor, enabled) {
  await poll(
    () => tableEditor.isBackEnabled(),
    (actual) => actual === enabled,
    { message: `Back never became ${enabled ? "enabled" : "disabled"}` },
  );
}

async function waitForForwardEnabled(tableEditor, enabled) {
  await poll(
    () => tableEditor.isForwardEnabled(),
    (actual) => actual === enabled,
    { message: `Forward never became ${enabled ? "enabled" : "disabled"}` },
  );
}

// Follows the reference in the selected cell and waits for the table it
// leads to (any table other than the current one)
async function followSelectedCellReference(tableEditor) {
  const before = await tableEditor.getSelectedTableName();
  await tableEditor.grid.followReferenceAtSelectedCell();
  await poll(
    () => tableEditor.getSelectedTableName(),
    (name) => name !== before,
    { message: "The reference was not followed" },
  );
  await tableEditor.waitForTableToLoad();
}

async function launch() {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  return { electronApp, app, window, tableEditor };
}

// Port of the v4 back-button.spec.js. React opens 4096 first, so 4097 is
// opened explicitly to start from the table the v4 test starts on.
test("back button (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, tableEditor } = await launch();
  const { grid } = tableEditor;

  // no history yet
  expect(await tableEditor.getSelectedTableName()).to.equal("4096");
  expect(await tableEditor.isBackEnabled()).to.equal(false);
  expect(await tableEditor.isForwardEnabled()).to.equal(false);

  await tableEditor.openTableById(4097);
  expect(await tableEditor.isBackEnabled()).to.equal(true);
  expect(await tableEditor.isForwardEnabled()).to.equal(false);

  // can go back one table
  await tableEditor.openTableById(7482);
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4097 - OverallPercentage");

  // can go back after clicking on a reference
  await followSelectedCellReference(tableEditor);
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4097 - OverallPercentage");

  // can go back to the specific cell that you were on
  await grid.selectCellAt(5, 0);
  await followSelectedCellReference(tableEditor);
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4097 - OverallPercentage");
  await waitForCellText(tableEditor, "Spline - 5");

  // can go back multiple tables and cells
  await followSelectedCellReference(tableEditor);
  await waitForTable(tableEditor, "7022 - Spline");
  await grid.selectCellAt(5, 1);
  await followSelectedCellReference(tableEditor);
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "7022 - Spline");
  await waitForCellText(tableEditor, "int[] - 10");

  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4097 - OverallPercentage");
  await waitForCellText(tableEditor, "Spline - 5");

  await electronApp.close();
});

test("forward button (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, app, tableEditor } = await launch();
  const { grid } = tableEditor;

  await tableEditor.openTableById(4098);
  await tableEditor.openTableById(7482);
  const team = await app.readTable(7482);
  await grid.selectCell(
    52,
    "LongName",
    team.headers.map((header) => header.name),
  );
  await waitForCellText(tableEditor, "New York");

  // Forward returns to where Back came from, including the selected cell
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4098 - CutDayStartEvent");
  expect(await tableEditor.isForwardEnabled()).to.equal(true);
  await tableEditor.clickForward();
  await waitForTable(tableEditor, "7482 - Team");
  await waitForCellText(tableEditor, "New York");
  await waitForForwardEnabled(tableEditor, false);

  // a sidebar click after going back drops Forward
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4098 - CutDayStartEvent");
  await waitForForwardEnabled(tableEditor, true);
  await tableEditor.openTableById(4104);
  await waitForForwardEnabled(tableEditor, false);
  expect(await tableEditor.isBackEnabled()).to.equal(true);

  // Back from the new table goes to where it was opened from, not to Team
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4098 - CutDayStartEvent");

  await electronApp.close();
});

test("history menu (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, tableEditor } = await launch();

  // history is 4096, 4097, 4098, 4104
  await tableEditor.openTableById(4097);
  await tableEditor.openTableById(4098);
  await tableEditor.openTableById(4104);

  // hold Back to open the menu, nearest first. Unnamed tables show the id.
  await tableEditor.openBackMenu();
  expect(await tableEditor.historyMenuItems()).to.deep.equal([
    "4098 CutDayStartEvent",
    "4097 OverallPercentage",
    "4096",
  ]);

  // picking the oldest (release over it) goes back several tables at once
  await tableEditor.pickHistoryItem("4096");
  await waitForTable(tableEditor, "4096");
  await tableEditor.locators.historyMenu.waitFor({ state: "hidden" });
  await waitForBackEnabled(tableEditor, false);

  // Forward lists the skipped ones, nearest first
  await tableEditor.openForwardMenu();
  expect(await tableEditor.historyMenuItems()).to.deep.equal([
    "4097 OverallPercentage",
    "4098 CutDayStartEvent",
    "4104 Stadium",
  ]);
  await tableEditor.pickHistoryItem("4098 CutDayStartEvent");
  await waitForTable(tableEditor, "4098 - CutDayStartEvent");
  await tableEditor.locators.historyMenu.waitFor({ state: "hidden" });

  // Back and Forward both have entries now: 4096, 4097 behind; 4104 ahead
  await tableEditor.openBackMenu({ rightClick: true });
  expect(await tableEditor.historyMenuItems()).to.deep.equal([
    "4097 OverallPercentage",
    "4096",
  ]);

  // Esc closes the menu without moving
  await tableEditor.closeHistoryMenu();
  expect(await tableEditor.getSelectedTableName()).to.equal(
    "4098 - CutDayStartEvent",
  );

  // right-click opens the same menu, and a click on a row picks it
  await tableEditor.openForwardMenu({ rightClick: true });
  expect(await tableEditor.historyMenuItems()).to.deep.equal(["4104 Stadium"]);
  await tableEditor.pickHistoryItem("4104 Stadium");
  await waitForTable(tableEditor, "4104 - Stadium");
  await waitForForwardEnabled(tableEditor, false);

  await electronApp.close();
});

test("back after jump to column and with Alt+Left (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, tableEditor } = await launch();
  const { grid } = tableEditor;

  await tableEditor.openTableById(7482);

  // jump to column pushes a step: Back returns to the previous cell in the
  // same table
  await grid.selectCellAt(10, 0);
  const firstCellText = await grid.getTextAtSelectedCell();
  await tableEditor.jumpToColumn("LongName", 52);
  await waitForCellText(tableEditor, "New York");

  await tableEditor.clickBack();
  expect(await tableEditor.getSelectedTableName()).to.equal("7482 - Team");
  await waitForCellText(tableEditor, firstCellText);

  // and Forward goes back to the jumped-to cell
  await tableEditor.clickForward();
  await waitForCellText(tableEditor, "New York");

  // Alt+Left goes back, Alt+Right forward
  await window.keyboard.press("Alt+ArrowLeft");
  await waitForCellText(tableEditor, firstCellText);
  await window.keyboard.press("Alt+ArrowLeft");
  await waitForTable(tableEditor, "4096");
  await window.keyboard.press("Alt+ArrowRight");
  await waitForTable(tableEditor, "7482 - Team");
  await waitForCellText(tableEditor, firstCellText);

  await electronApp.close();
});
