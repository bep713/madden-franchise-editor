const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { stubSaveDialog } = require("../../util/dialogStubs");
const { readSavedTable } = require("../../util/diskReader");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const NotificationDrawer = require("../../models/react/NotificationDrawer");
const Banner = require("../../models/react/Banner");
const NavigationBar = require("../../models/react/NavigationBar");

const BANNER_MESSAGE =
  "This save file was deleted or moved outside of this program. Save it again here, or save it to a new location?";
const TEAM_TABLE_ID = 7482;
const ROW = 52;
const AUTO_SAVE = { general: { autoSave: [true] } };

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

// Opens the career (dismissing the mismatch banner)
async function launch(options = {}) {
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    ...options,
  });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  // Give the watcher time to start before the file is deleted
  await wait(1000);
  return {
    app,
    window,
    welcome,
    tableEditor: new TableEditorPage(window),
    drawer: new NotificationDrawer(window),
    banner: new Banner(window),
    nav: new NavigationBar(window),
    strip: window.getByTestId("auto-save-paused"),
  };
}

// The store in main, read without opening the drawer (which marks all read)
async function storedOfKind(window, kind) {
  const list = await window.evaluate(() =>
    window.electronAPI.notifications.list(),
  );
  return list.filter((n) => n.kind === kind);
}

async function waitForNoFileMissing(window) {
  await poll(
    () => storedOfKind(window, "file-missing"),
    (list) => list.length === 0,
    { message: "The File Missing notification is still stored" },
  );
}

// Deletes the career and waits for the file-missing banner
async function deleteExternally(banner) {
  fs.unlinkSync(careerPath);
  await banner.waitForBanner("file-missing", { timeout: 10000 });
}

async function headerNames(app) {
  const team = await app.readTable(TEAM_TABLE_ID);
  return team.headers.map((header) => header.name);
}

async function readLongName(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["LongName"]);
  return team.records[ROW].LongName;
}

async function openTeamTable(welcome, tableEditor) {
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
}

// Edits Team LongName in the open Team table
async function setLongName(app, tableEditor) {
  await tableEditor.grid.selectCell(ROW, "LongName", await headerNames(app));
  await tableEditor.grid.setTextAtSelectedCell("Old York");
  await poll(
    () => readLongName(app),
    (name) => name === "Old York",
    { message: "The edit never reached the file" },
  );
}

async function windowTitle() {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getTitle(),
  );
}

test("an external delete shows the banner and a drawer entry (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, drawer, banner } = await launch();

  await deleteExternally(banner);
  expect(await banner.message()).to.equal(BANNER_MESSAGE);

  const [stored] = await storedOfKind(window, "file-missing");
  await drawer.open();
  await poll(
    () => drawer.item(stored.id).count(),
    (count) => count === 1,
    { message: "The drawer never listed File Missing" },
  );
  const item = (await drawer.items()).find((i) => i.id === stored.id);
  expect(item).to.include({
    kind: "file-missing",
    title: "File Missing",
    description: "CAREER-E2ETEST was deleted or moved outside the editor.",
  });
  expect(await drawer.linkIds(stored.id)).to.deep.equal([
    "save-here",
    "branch",
  ]);
});

test("Save here recreates the deleted file (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, banner } = await launch();

  await deleteExternally(banner);
  await banner.saveHere();

  await poll(
    () => fs.existsSync(careerPath),
    (exists) => exists,
    { message: "Save here did not recreate the file", timeout: 30000 },
  );
  const team = await readSavedTable(careerPath, TEAM_TABLE_ID, ["LongName"]);
  expect(team.records[ROW].LongName).to.equal("New York");
  await waitForNoFileMissing(window);
});

test("Save as new writes the deleted file to a new path (react)", async () => {
  test.setTimeout(120 * 1000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-missing-"));
  const branchPath = path.join(dir, "CAREER-BRANCH");
  try {
    const { window, banner } = await launch();

    await deleteExternally(banner);
    await stubSaveDialog(electronApp, branchPath);
    await banner.saveAsNew();

    await poll(
      () => fs.existsSync(branchPath),
      (exists) => exists,
      { message: "Save as new did not write the new file", timeout: 30000 },
    );
    await poll(
      () => windowTitle(),
      (title) => title.includes(branchPath),
      { message: "The title never showed the new path" },
    );
    await waitForNoFileMissing(window);
    expect(fs.existsSync(careerPath)).to.equal(false);

    await electronApp.close();
    electronApp = null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("auto-save pauses on an external delete until Dismiss (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, drawer, banner, nav, strip } =
    await launch({ preferences: AUTO_SAVE });

  await openTeamTable(welcome, tableEditor);
  await deleteExternally(banner);
  await strip.waitFor();
  expect(await strip.innerText()).to.include(
    "Auto-save is paused: CAREER-E2ETEST was deleted or moved outside the editor.",
  );

  await setLongName(app, tableEditor);
  await wait(1000);
  expect(fs.existsSync(careerPath)).to.equal(false);

  // The banner may have timed out during the edit; the drawer X also dismisses
  if (await banner.isVisible()) {
    await banner.dismiss();
  } else {
    const [stored] = await storedOfKind(window, "file-missing");
    await nav.openTab("Home");
    await drawer.open();
    await drawer.dismiss(stored.id);
  }
  await poll(
    () => strip.count(),
    (count) => count === 0,
    { message: "The auto-save paused strip is still shown" },
  );
  await poll(
    () => fs.existsSync(careerPath),
    (exists) => exists,
    { message: "The paused edit was never auto-saved", timeout: 30000 },
  );
  const team = await readSavedTable(careerPath, TEAM_TABLE_ID, ["LongName"]);
  expect(team.records[ROW].LongName).to.equal("Old York");
});

test("renaming the file back replaces File Missing with File Changed (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, banner } = await launch();
  const movedPath = `${careerPath}-MOVED`;

  fs.renameSync(careerPath, movedPath);
  await banner.waitForBanner("file-missing", { timeout: 10000 });
  fs.renameSync(movedPath, careerPath);

  await banner.waitForBanner("file-changed", { timeout: 10000 });
  await waitForNoFileMissing(window);
  expect(await storedOfKind(window, "file-changed")).to.have.length(1);
});
