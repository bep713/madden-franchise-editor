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
const ExternalChangeBar = require("../../models/react/ExternalChangeBar");

const BAR_TEXT = "CAREER-E2ETEST was deleted or moved outside the editor.";
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
    bar: new ExternalChangeBar(window),
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

// Deletes the career and waits for the bar
async function deleteExternally(bar) {
  fs.unlinkSync(careerPath);
  await bar.waitFor({ reason: "missing" });
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

test("an external delete shows the bar, no banner, and a drawer entry without dismiss (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, drawer, bar } = await launch();

  await deleteExternally(bar);
  expect(await bar.text()).to.include(BAR_TEXT);
  expect(await bar.buttons()).to.deep.equal([
    "Save mine as a copy…",
    "Put it back",
    "Hide",
  ]);
  expect(
    await window.locator('[data-testid="banner"][data-kind="file-missing"]').count(),
  ).to.equal(0);

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
    description: BAR_TEXT,
  });
  expect(await drawer.linkIds(stored.id)).to.deep.equal(["copy", "put-back"]);
  expect(
    await drawer.item(stored.id).locator('[data-action="dismiss-notification"]').count(),
  ).to.equal(0);
});

test("Put it back recreates the deleted file (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, bar } = await launch();

  await deleteExternally(bar);
  await bar.putBack();

  await poll(
    () => fs.existsSync(careerPath),
    (exists) => exists,
    { message: "Put it back did not recreate the file", timeout: 30000 },
  );
  const team = await readSavedTable(careerPath, TEAM_TABLE_ID, ["LongName"]);
  expect(team.records[ROW].LongName).to.equal("New York");
  await waitForNoFileMissing(window);
  await bar.waitForHidden();
});

test("Save mine as a copy writes the deleted file to a new path (react)", async () => {
  test.setTimeout(120 * 1000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-missing-"));
  const copyPath = path.join(dir, "CAREER-BRANCH");
  try {
    const { window, bar } = await launch();

    await deleteExternally(bar);
    await stubSaveDialog(electronApp, copyPath);
    await bar.copy();

    await poll(
      () => fs.existsSync(copyPath),
      (exists) => exists,
      { message: "The copy was not written", timeout: 30000 },
    );
    await poll(
      () => windowTitle(),
      (title) => title.includes(copyPath),
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

test("auto-save pauses on an external delete until Put it back (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, welcome, tableEditor, bar } = await launch({
    preferences: AUTO_SAVE,
  });

  await openTeamTable(welcome, tableEditor);
  await deleteExternally(bar);
  expect(await bar.text()).to.include(
    "Auto-save is paused until you choose.",
  );
  expect(await bar.buttons()).not.to.include("Hide");

  await setLongName(app, tableEditor);
  await wait(1000);
  expect(fs.existsSync(careerPath)).to.equal(false);

  await bar.putBack();
  await bar.waitForHidden();
  await poll(
    () => fs.existsSync(careerPath),
    (exists) => exists,
    { message: "Put it back never wrote the file", timeout: 30000 },
  );
  const team = await readSavedTable(careerPath, TEAM_TABLE_ID, ["LongName"]);
  expect(team.records[ROW].LongName).to.equal("Old York");
});

test("renaming the file back replaces File Missing with File Changed (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, bar } = await launch();
  const movedPath = `${careerPath}-MOVED`;

  fs.renameSync(careerPath, movedPath);
  await bar.waitFor({ reason: "missing" });
  fs.renameSync(movedPath, careerPath);

  await bar.waitFor({ reason: "changed" });
  await waitForNoFileMissing(window);
  expect(await storedOfKind(window, "file-changed")).to.have.length(1);
});
