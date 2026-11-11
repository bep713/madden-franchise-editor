const fs = require("fs/promises");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const SettingsManager = require("../../models/SettingsManager");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const LegacyWelcomePage = require("../../models/WelcomePage");
const LegacyTableEditorPage = require("../../models/TableEditorPage");

const TEAM_TABLE_ID = 7482;
const ROW = 52;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

// general.uiVersion in the test profile's preferences.json
async function storedUiVersion() {
  const preferences = JSON.parse(
    await fs.readFile(
      path.join(electron.userDataDir, "preferences.json"),
      "utf8",
    ),
  );
  return preferences.general.uiVersion;
}

async function readLongName(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["LongName"]);
  return team.records[ROW].LongName;
}

async function openReactTeamTable(app, window) {
  const tableEditor = new TableEditorPage(window);
  await new WelcomePage(window).openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  const team = await app.readTable(TEAM_TABLE_ID);
  await tableEditor.grid.selectCell(
    ROW,
    "LongName",
    team.headers.map((header) => header.name),
  );
  return tableEditor;
}

async function openLegacyTeamTable(window) {
  const tableEditor = new LegacyTableEditorPage(window);
  await new LegacyWelcomePage(window).openTableEditor();
  await tableEditor.waitForSelectedTable();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  await tableEditor.jumpToColumn("LongName", ROW);
  return tableEditor;
}

async function openSettings(app) {
  await app._clickMenuItem("ShowPreferences");
  const settingsManager = new SettingsManager(await app.getSettingsManager());
  await settingsManager.locators.uiVersionSelect.waitFor();
  return settingsManager;
}

test("switches to legacy with the open file (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.switchToLegacy();

  // v4 comes up on Home with the file still open
  const legacyWelcome = new LegacyWelcomePage(window);
  await legacyWelcome.waitForOpenFile();
  const tableEditor = await openLegacyTeamTable(window);
  expect(await tableEditor.getTextAtSelectedCell()).to.equal("New York");

  expect(await storedUiVersion()).to.equal("v4");
  expect(await app.isMenuItemChecked("UiVersionV4")).to.equal(true);

  await electronApp.close();
});

test("keeps a legacy edit when switching to new (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({
    preferences: { general: { autoSave: [true] } },
  });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const legacyWelcome = new LegacyWelcomePage(window);
  await legacyWelcome.waitForPageLoad();
  await legacyWelcome.openFranchiseFile(careerPath);
  const before = await fs.stat(careerPath);
  const legacyTableEditor = await openLegacyTeamTable(window);
  await legacyTableEditor.setTextAtSelectedCell("Old York");
  await poll(
    async () => (await fs.stat(careerPath)).mtimeMs,
    (mtime) => mtime > before.mtimeMs,
    { message: "Autosave did not write the file", timeout: 30000 },
  );

  await legacyTableEditor.tabs.openTabByName("Home");
  await legacyWelcome.waitForOpenFile();
  await legacyWelcome.switchToNew();

  // React shows the open file, path included
  const welcome = new WelcomePage(window);
  await welcome.waitForOpenFile(careerPath);
  await welcome.locators.openFileLocationLink.waitFor();
  expect(await storedUiVersion()).to.equal("v5");

  const tableEditor = await openReactTeamTable(app, window);
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Old York");

  // The edit is in the file on disk: close and reopen it
  await app.closeFile();
  await poll(
    () => window.evaluate(() => window.franchiseAPI.getActiveFileId()),
    (fileId) => fileId === null,
    { message: "The file was not closed" },
  );
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  expect(await readLongName(app)).to.equal("Old York");

  await electronApp.close();
});

test("switches to legacy through Preferences (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  await new WelcomePage(window).waitForPageLoad();

  const settingsManager = await openSettings(app);
  expect(await settingsManager.locators.uiVersionSelect.inputValue()).to.equal(
    "v5",
  );
  await settingsManager.setUiVersion("v4");
  await settingsManager.clickContinue();

  await new LegacyWelcomePage(window).locators.switchUiLink.waitFor();
  expect(await storedUiVersion()).to.equal("v4");

  await electronApp.close();
});

test("switches to new through the View menu (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  await new LegacyWelcomePage(window).waitForPageLoad();
  expect(await app.isMenuItemChecked("UiVersionV4")).to.equal(true);

  await app.clickMenuItem("UiVersionV5");

  await new WelcomePage(window).locators.getStartedCard.waitFor();
  expect(await app.isMenuItemChecked("UiVersionV5")).to.equal(true);
  expect(await storedUiVersion()).to.equal("v5");

  await electronApp.close();
});
