const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { stubMessageBox, messageBoxCalls } = require("../../util/dialogStubs");
const { readSavedTable } = require("../../util/diskReader");
const {
  setNextUpdate,
  setDownloadError,
  holdDownload,
  releaseDownload,
  updaterCounts,
} = require("../../util/updaterStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const NotificationDrawer = require("../../models/react/NotificationDrawer");
const Banner = require("../../models/react/Banner");
const LegacyWelcomePage = require("../../models/WelcomePage");

const VERSION = "99.0.0";
const NO_UPDATES =
  "There are no updates available, you are running the latest version.";
const ERROR_MESSAGE = "There was an unexpected error when trying to update.";
const TEAM_TABLE_ID = 7482;
const ROW = 52;
const SAVE_AND_INSTALL = 0;
const CANCEL = 2;
// Startup check right away, so the automatic-check tests don't wait 3 s
const AUTO_CHECK = {
  preferences: { general: { checkForUpdates: [true] } },
  env: { MFE_UPDATE_CHECK_DELAY_MS: "0" },
};

let electronApp;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function launch(options = {}) {
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    ...options,
  });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  return {
    app,
    window,
    welcome,
    banner: new Banner(window),
    drawer: new NotificationDrawer(window),
  };
}

async function readyMessage() {
  const current = await electronApp.evaluate(({ app }) => app.getVersion());
  return `Version ${VERSION} is available (you have ${current}). It will take less than 5 minutes to install.`;
}

// Menu Help → Check for Update with `next` as the result, then waits for the
// update-available banner
async function checkWithUpdate(app, banner) {
  await setNextUpdate(electronApp, { version: VERSION });
  await app.clickMenuItem("CheckForUpdate");
  await banner.waitForMessage("update", await readyMessage());
}

async function waitForCount(key, count) {
  await poll(
    () => updaterCounts(electronApp),
    (counts) => counts[key] === count,
    { message: `The fake updater never counted ${count} ${key}` },
  );
}

async function updateNotifications(window) {
  const list = await window.evaluate(() =>
    window.electronAPI.notifications.list(),
  );
  return list.filter((n) => n.kind === "update-available");
}

// Opens the career and edits Team LongName in memory (auto-save is off)
async function openAndEdit(app, window, welcome) {
  await welcome.openFranchiseFile(electronApp, careerPath);
  const tableEditor = new TableEditorPage(window);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  const team = await app.readTable(TEAM_TABLE_ID);
  await tableEditor.grid.selectCell(
    ROW,
    "LongName",
    team.headers.map((header) => header.name),
  );
  await tableEditor.grid.setTextAtSelectedCell("Old York");
  await poll(
    async () =>
      (await app.readTable(TEAM_TABLE_ID, ["LongName"])).records[ROW].LongName,
    (name) => name === "Old York",
    { message: "The edit never reached the file" },
  );
}

test("a manual check offers the update and installs it (react)", async () => {
  const { app, banner } = await launch();

  await checkWithUpdate(app, banner);
  await banner.click("Update");

  await waitForCount("installs", 1);
  expect(await updaterCounts(electronApp)).to.include({ downloads: 1 });
});

test("a manual check with no update says so, then hides (react)", async () => {
  const { app, banner } = await launch();

  await app.clickMenuItem("CheckForUpdate");
  await banner.waitForMessage("update", NO_UPDATES);
  // 3.5 s duration plus the slide-out
  await banner.waitForHidden({ timeout: 8000 });
});

test("the automatic check is quiet (react)", async () => {
  const { banner } = await launch(AUTO_CHECK);

  await waitForCount("checks", 1);
  await wait(1000);
  expect(await banner.isVisible()).to.equal(false);
});

test("an automatic check adds a drawer entry that installs (react)", async () => {
  // The update has to be set before the startup check, which runs on load
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: AUTO_CHECK.preferences,
    env: { MFE_UPDATE_CHECK_DELAY_MS: "2000" },
  });
  await setNextUpdate(electronApp, { version: VERSION });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  await new WelcomePage(window).waitForPageLoad();
  const drawer = new NotificationDrawer(window);

  const [stored] = await poll(
    () => updateNotifications(window),
    (list) => list.length === 1,
    { message: "The update was never stored", timeout: 15000 },
  );
  await drawer.waitForBadgeCount(1);
  await drawer.open();
  const item = (await drawer.items()).find((i) => i.id === stored.id);
  expect(item).to.include({
    kind: "update-available",
    title: "Update Available",
  });
  expect(await drawer.linkIds(stored.id)).to.deep.equal(["install-update"]);

  await drawer.clickNotificationLink(stored.id, "install-update");
  await waitForCount("installs", 1);
});

test("Save and install saves unsaved edits first (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, banner } = await launch();
  await openAndEdit(app, window, welcome);

  await stubMessageBox(electronApp, SAVE_AND_INSTALL);
  await checkWithUpdate(app, banner);
  await banner.click("Update");

  await waitForCount("installs", 1);
  const calls = await messageBoxCalls(electronApp);
  expect(calls).to.have.length(1);
  expect(calls[0].buttons).to.deep.equal([
    "Save and install",
    "Install without saving",
    "Cancel",
  ]);
  const saved = await readSavedTable(careerPath, TEAM_TABLE_ID, ["LongName"]);
  expect(saved.records[ROW].LongName).to.equal("Old York");
});

test("cancelling the unsaved-edits prompt skips the download (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, banner } = await launch();
  await openAndEdit(app, window, welcome);

  await stubMessageBox(electronApp, CANCEL);
  await checkWithUpdate(app, banner);
  await banner.click("Update");

  await poll(
    () => messageBoxCalls(electronApp),
    (calls) => calls.length === 1,
    { message: "The unsaved-edits prompt never showed" },
  );
  await wait(500);
  expect(await updaterCounts(electronApp)).to.include({
    downloads: 0,
    installs: 0,
  });
});

test("a download error shows a sticky Update manually banner (react)", async () => {
  const { app, banner } = await launch();

  await setDownloadError(electronApp, "download failed");
  await checkWithUpdate(app, banner);
  await banner.click("Update");

  await banner.waitForMessage("update", ERROR_MESSAGE);
  await banner.locators.banner
    .getByRole("button", { name: "Update manually", exact: true })
    .waitFor();
  // Sticky: still shown past the default 8 s
  await wait(9000);
  expect(await banner.message()).to.equal(ERROR_MESSAGE);
  expect(await updaterCounts(electronApp)).to.include({ installs: 0 });
});

test("a UI switch during a download restores the progress (react)", async () => {
  test.setTimeout(60 * 1000);
  const { app, window, banner } = await launch();

  await holdDownload(electronApp);
  await checkWithUpdate(app, banner);
  await banner.click("Update");
  await banner.waitForMessage("update", "Downloading… 50%");

  await app.clickMenuItem("UiVersionV4");
  await new LegacyWelcomePage(window).locators.switchUiLink.waitFor();
  await app.clickMenuItem("UiVersionV5");
  await new WelcomePage(window).waitForPageLoad();

  await banner.waitForMessage("update", "Downloading… 50%");
  await wait(500);
  expect(await banner.message()).to.equal("Downloading… 50%");

  await releaseDownload(electronApp);
  await waitForCount("installs", 1);
});
