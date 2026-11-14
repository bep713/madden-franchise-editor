const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { stubOpenDialog } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const TableEditorPage = require("../../models/react/TableEditorPage");
const SchemaManagementPage = require("../../models/react/SchemaManagementPage");
const ScheduleEditorPage = require("../../models/react/ScheduleEditorPage");

const MAIN_TABS = ["Home", "Schedule", "Schemas"];

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

// The grid's vertical scroll position
async function gridScrollTop(window) {
  return window
    .locator(".ht_master .wtHolder")
    .evaluate((holder) => holder.scrollTop);
}

async function waitForTable(tableEditor, name) {
  await poll(
    () => tableEditor.getSelectedTableName(),
    (selected) => selected === name,
    { message: `${name} never loaded` },
  );
  await tableEditor.waitForTableToLoad();
}

// Port of the v4 tabs.spec.js. React opens the first table (4096, shown as
// "4096") where v4 opens 4097.
test("tabs test (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);
  const tableEditor = new TableEditorPage(window);

  // only Home and Schemas before a file is open
  await welcome.waitForPageLoad();
  expect(await nav.tabNames()).to.deep.equal(["Home", "Schemas"]);
  expect(await nav.hasNewTabButton()).to.equal(false);

  await welcome.openFranchiseFile(electronApp, careerPath);
  expect(await nav.tabNames()).to.deep.equal([...MAIN_TABS, "Open Table..."]);
  expect(await nav.hasNewTabButton()).to.equal(true);

  // Schedule opens the schedule, and the tabs stay the same
  await nav.openTab("Schedule");
  await new ScheduleEditorPage(window).waitForLoad();
  expect(await nav.activeTabName()).to.equal("Schedule");
  expect(await nav.tabNames()).to.deep.equal([...MAIN_TABS, "Open Table..."]);

  // can click on the default tab to load the first table
  await nav.openTab("Open Table...");
  await tableEditor.waitForTableToLoad();
  await nav.waitForActiveTab("4096");
  expect(await nav.hasTab("Open Table...")).to.equal(false);
  expect(await nav.tabCount()).to.equal(4);

  // a new file gets a fresh tab set, and the Welcome link does the same
  await app.closeFile();
  await welcome.waitForPageLoad();
  await poll(
    () => nav.tabNames(),
    (names) => names.join() === "Home,Schemas",
    { message: "Closing the file did not reset the tabs" },
  );
  await welcome.openFranchiseFile(electronApp, careerPath);
  expect(await nav.hasTab("Open Table...")).to.equal(true);

  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await nav.waitForActiveTab("4096");
  expect(await nav.hasTab("Open Table...")).to.equal(false);
  expect(await nav.tabCount()).to.equal(4);

  // tab name changes to match the table name
  await tableEditor.openTableById(7482);
  await nav.waitForActiveTab("7482 - Team");

  // can open a new tab, which switches to it and loads the first table
  await nav.openNewTab();
  await nav.waitForActiveTab("4096");
  await waitForTable(tableEditor, "4096");
  expect(await nav.tabCount()).to.equal(5);

  // can close the active tab, which opens the tab to the left
  await nav.closeActiveTab();
  await nav.waitForActiveTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  expect(await nav.tabCount()).to.equal(4);

  await nav.openNewTab();
  await waitForTable(tableEditor, "4096");
  await tableEditor.openTableById(4098);
  await nav.waitForActiveTab("4098 - CutDayStartEvent");

  await nav.openNewTab();
  await nav.waitForActiveTab("4096");
  await waitForTable(tableEditor, "4096");
  expect(await nav.tabCount()).to.equal(6);

  // can switch between tabs, and each remembers its table, selected cell
  // and scroll position
  await nav.openTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  const team = await app.readTable(7482);
  await tableEditor.grid.selectCell(
    52,
    "LongName",
    team.headers.map((header) => header.name),
  );
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("New York");
  const scrollTop = await gridScrollTop(window);
  expect(scrollTop).to.be.greaterThan(0);

  await nav.openTab("4098 - CutDayStartEvent");
  await waitForTable(tableEditor, "4098 - CutDayStartEvent");

  await nav.openTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  await poll(
    () => tableEditor.grid.getTextAtSelectedCell(),
    (text) => text === "New York",
    { message: "The selected cell was not restored" },
  );
  await poll(
    () => gridScrollTop(window),
    (top) => top === scrollTop,
    { message: `The scroll position was not restored to ${scrollTop}` },
  );

  // can close a tab that isn't active. The active tab doesn't change.
  await nav.closeTab("4098 - CutDayStartEvent");
  expect(await nav.tabCount()).to.equal(5);
  expect(await nav.activeTabName()).to.equal("7482 - Team");
  expect(await tableEditor.getSelectedTableName()).to.equal("7482 - Team");

  // each tab has its own history. Team was opened from 4096 in this tab, so
  // Back goes to 4096 (not to 4098, which another tab visited).
  expect(await tableEditor.isBackEnabled()).to.equal(true);
  expect(await tableEditor.isForwardEnabled()).to.equal(false);
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4096");
  await tableEditor.clickForward();
  await waitForTable(tableEditor, "7482 - Team");
  await poll(
    () => tableEditor.grid.getTextAtSelectedCell(),
    (text) => text === "New York",
    { message: "Forward did not restore the selected cell" },
  );

  // a new tab starts with no history, and navigating in it doesn't touch the
  // other tab's
  await nav.openLastTab();
  await nav.waitForActiveTab("4096");
  await waitForTable(tableEditor, "4096");
  expect(await tableEditor.isBackEnabled()).to.equal(false);
  expect(await tableEditor.isForwardEnabled()).to.equal(false);
  await tableEditor.openTableById(4104);
  expect(await tableEditor.isBackEnabled()).to.equal(true);
  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4096");
  expect(await tableEditor.isForwardEnabled()).to.equal(true);

  await nav.openTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  expect(await tableEditor.isBackEnabled()).to.equal(true);
  expect(await tableEditor.isForwardEnabled()).to.equal(false);

  // can click the Home tab to go to the Welcome page
  await nav.openTab("Home");
  await welcome.waitForPageLoad();
  expect(await nav.activeTabName()).to.equal("Home");

  // the Welcome link goes back to the first table tab
  await welcome.openTableEditor();
  await nav.waitForActiveTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  expect(await nav.tabCount()).to.equal(5);

  // can close every table tab. Closing the active one goes to the tab on its
  // left, Schemas.
  await nav.closeActiveTab();
  await nav.waitForActiveTab("Schemas");
  await new SchemaManagementPage(window).waitForPageLoad();
  await nav.closeTab("4096");
  expect(await nav.tabNames()).to.deep.equal(MAIN_TABS);
  await nav.openTab("Home");
  await welcome.waitForPageLoad();

  // the Welcome link then opens a new tab on the first table
  await welcome.openTableEditor();
  await nav.waitForActiveTab("4096");
  await waitForTable(tableEditor, "4096");
  expect(await nav.tabCount()).to.equal(4);
  expect(await nav.hasTab("Open Table...")).to.equal(false);

  await electronApp.close();
});

// The highlighted row header of the selected cell
async function waitForSelectedRow(window, row) {
  const header = window.locator(".ht_clone_inline_start tbody th.ht__highlight");
  await poll(
    () => header.first().innerText(),
    (text) => text.trim() === String(row),
    { message: `Row ${row} was not selected` },
  );
}

test("open tables in new tabs (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await waitForTable(tableEditor, "4096");

  // ctrl+click in the sidebar opens a new active tab
  await tableEditor.ctrlClickSidebarTable(7482);
  await nav.waitForActiveTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  expect(await nav.tabNames()).to.deep.equal([
    ...MAIN_TABS,
    "4096",
    "7482 - Team",
  ]);

  // middle-click opens a background tab
  await tableEditor.middleClickSidebarTable(4104);
  await poll(
    () => nav.hasTab("4104 - Stadium"),
    (has) => has,
    { message: "4104 was not opened in a new tab" },
  );
  expect(await nav.activeTabName()).to.equal("7482 - Team");
  expect(await tableEditor.getSelectedTableName()).to.equal("7482 - Team");

  // ctrl+click a reference opens it in a new active tab at its row
  const team = await app.readTable(7482);
  const teamHeaders = team.headers.map((header) => header.name);
  await tableEditor.grid.selectCell(43, "Stadium", teamHeaders);
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    "Stadium - 12",
  );
  await tableEditor.grid.followReferenceAtSelectedCell({
    modifiers: ["Control"],
  });
  await nav.waitForActiveTab("4104 - Stadium");
  await waitForTable(tableEditor, "4104 - Stadium");
  await waitForSelectedRow(window, 12);
  expect(await nav.tabCount()).to.equal(7);

  // the tab it came from still shows Team
  await nav.openTab("7482 - Team");
  await waitForTable(tableEditor, "7482 - Team");
  await poll(
    () => tableEditor.grid.getTextAtSelectedCell(),
    (text) => text === "Stadium - 12",
    { message: "The Team tab lost its selected cell" },
  );

  // middle-click the reference opens a background tab, loaded when opened
  await tableEditor.grid.followReferenceAtSelectedCell({ button: "middle" });
  await poll(
    () => nav.tabCount(),
    (count) => count === 8,
    { message: "The reference was not opened in a new tab" },
  );
  expect(await nav.activeTabName()).to.equal("7482 - Team");
  expect(await tableEditor.getSelectedTableName()).to.equal("7482 - Team");

  await nav.openLastTab();
  await nav.waitForActiveTab("4104 - Stadium");
  await waitForTable(tableEditor, "4104 - Stadium");
  await waitForSelectedRow(window, 12);

  await electronApp.close();
});

test("default editor opens the table editor (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: { general: { defaultEditor: "open-table-editor" } },
  });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();

  // "Open Table..." must never be drawn on the way to the table editor
  await window.evaluate(() => {
    window.__sawPlaceholderTab = false;
    new MutationObserver(() => {
      if (document.querySelector('[role="tab"][data-name="Open Table..."]')) {
        window.__sawPlaceholderTab = true;
      }
    }).observe(document.body, { childList: true, subtree: true });
  });

  // Not welcome.openFranchiseFile, which waits on the Welcome page
  await stubOpenDialog(electronApp, careerPath);
  await welcome.locators.openFileLink.click();

  await nav.waitForActiveTab("4096");
  await waitForTable(tableEditor, "4096");
  expect(await nav.tabNames()).to.deep.equal([...MAIN_TABS, "4096"]);
  expect(await window.evaluate(() => window.__sawPlaceholderTab)).to.equal(
    false,
  );

  await electronApp.close();
});
