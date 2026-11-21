const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const {
  stubMessageBox,
  stubSaveDialog,
  messageBoxCalls,
} = require("../../util/dialogStubs");
const { readSavedTable } = require("../../util/diskReader");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const NotificationDrawer = require("../../models/react/NotificationDrawer");
const ExternalChangeBar = require("../../models/react/ExternalChangeBar");
const NavigationBar = require("../../models/react/NavigationBar");

const TEAM_TABLE_ID = 7482;
const ROW = 52;
const CONFIRM = 0;
const CANCEL = 1;
const AUTO_SAVE = { general: { autoSave: [true] } };
const BAR_TEXT =
  "CAREER-E2ETEST was changed outside the editor. Which version do you want to keep?";
const PAUSED = "Auto-save is paused until you choose.";

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

// Writes the file's own bytes back, so the watcher fires without the data
// changing
function touchExternally(filePath) {
  fs.writeFileSync(filePath, fs.readFileSync(filePath));
}

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
  // Give the watcher time to start before the file is touched
  await wait(1000);
  return {
    app,
    window,
    welcome,
    tableEditor: new TableEditorPage(window),
    drawer: new NotificationDrawer(window),
    nav: new NavigationBar(window),
    bar: new ExternalChangeBar(window),
  };
}

// The store in main, read without opening the drawer (which marks all read)
async function fileChangedNotifications(window) {
  const list = await window.evaluate(() =>
    window.electronAPI.notifications.list(),
  );
  return list.filter((n) => n.kind === "file-changed");
}

async function waitForNoFileChanged(window) {
  await poll(
    () => fileChangedNotifications(window),
    (list) => list.length === 0,
    { message: "The File Changed notification is still stored" },
  );
}

// Touches the career and waits for the bar (1s debounce)
async function changeExternally(bar) {
  touchExternally(careerPath);
  await bar.waitFor({ reason: "changed" });
}

// A real change: different bytes, so a save of ours would overwrite them.
// Returns the bytes and mtime on disk.
async function changeBytesExternally(bar) {
  const external = Buffer.concat([
    fs.readFileSync(careerPath),
    Buffer.from("EXTERNAL"),
  ]);
  fs.writeFileSync(careerPath, external);
  await bar.waitFor({ reason: "changed" });
  return { external, mtimeMs: fs.statSync(careerPath).mtimeMs };
}

function expectUnchanged({ external, mtimeMs }) {
  expect(fs.statSync(careerPath).mtimeMs).to.equal(mtimeMs);
  expect(fs.readFileSync(careerPath).equals(external)).to.equal(true);
}

async function waitForWritten({ external }, message) {
  await poll(
    () => fs.readFileSync(careerPath).equals(external),
    (same) => !same,
    { message, timeout: 30000 },
  );
}

async function headerNames(app) {
  const team = await app.readTable(TEAM_TABLE_ID);
  return team.headers.map((header) => header.name);
}

async function readLongName(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["LongName"]);
  return team.records[ROW].LongName;
}

async function savedLongName() {
  const team = await readSavedTable(careerPath, TEAM_TABLE_ID, ["LongName"]);
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

async function editLongName(app, welcome, tableEditor) {
  await openTeamTable(welcome, tableEditor);
  await setLongName(app, tableEditor);
}

async function waitForBoxes(count) {
  return poll(
    () => messageBoxCalls(electronApp),
    (calls) => calls.length === count,
    { message: `Expected ${count} message box(es)` },
  );
}

async function windowTitle() {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].getTitle(),
  );
}

test("an external change shows the bar, no banner, and a drawer entry without dismiss (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, drawer, bar } = await launch();

  await changeExternally(bar);
  expect(await bar.text()).to.include(BAR_TEXT);
  expect(await bar.text()).not.to.include(PAUSED);
  expect(await bar.buttons()).to.deep.equal([
    "Save mine as a copy…",
    "Load the new version",
    "Keep my version",
    "Hide",
  ]);
  expect(
    await window.locator('[data-testid="banner"][data-kind="file-changed"]').count(),
  ).to.equal(0);

  const [stored] = await fileChangedNotifications(window);
  await drawer.open();
  await poll(
    () => drawer.item(stored.id).count(),
    (count) => count === 1,
    { message: "The drawer never listed File Changed" },
  );
  const item = (await drawer.items()).find((i) => i.id === stored.id);
  expect(item).to.include({
    kind: "file-changed",
    title: "File Changed",
    description: "CAREER-E2ETEST was changed outside the editor.",
  });
  expect(await drawer.linkIds(stored.id)).to.deep.equal(["copy", "load", "keep"]);
  expect(
    await drawer.item(stored.id).locator('[data-action="dismiss-notification"]').count(),
  ).to.equal(0);
  // main refuses a dismiss too
  await window.evaluate(
    (id) => window.electronAPI.notifications.dismiss(id),
    stored.id,
  );
  expect(await fileChangedNotifications(window)).to.have.length(1);
});

test("Load the new version drops unsaved edits after the confirm (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, bar } = await launch();

  await editLongName(app, welcome, tableEditor);
  await changeExternally(bar);
  await stubMessageBox(electronApp, CONFIRM);
  await bar.load();

  await poll(
    () => readLongName(app),
    (name) => name === "New York",
    { message: "The load never restored the on-disk value" },
  );
  const [box] = await messageBoxCalls(electronApp);
  expect(box).to.include({
    message: "Load the new version of CAREER-E2ETEST?",
    detail: "Your unsaved edits will be lost.",
  });
  expect(box.buttons).to.deep.equal(["Load new version", "Cancel"]);
  await waitForNoFileChanged(window);
  await bar.waitForHidden();

  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  await tableEditor.grid.selectCell(ROW, "LongName", await headerNames(app));
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("New York");
});

test("cancelling the Load confirm keeps the edit (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, bar } = await launch();

  await editLongName(app, welcome, tableEditor);
  await changeExternally(bar);
  await stubMessageBox(electronApp, CANCEL);
  await bar.load();

  await waitForBoxes(1);
  await wait(500);
  expect(await readLongName(app)).to.equal("Old York");
  expect(await fileChangedNotifications(window)).to.have.length(1);
});

test("Load the new version with no edits doesn't ask (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, bar } = await launch({ preferences: AUTO_SAVE });

  await changeExternally(bar);
  await stubMessageBox(electronApp, CANCEL);
  await bar.load();

  await bar.waitForHidden();
  await waitForNoFileChanged(window);
  expect(await messageBoxCalls(electronApp)).to.have.length(0);
});

test("Save mine as a copy moves the file to the new path (react)", async () => {
  test.setTimeout(120 * 1000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-branch-"));
  const copyPath = path.join(dir, "CAREER-BRANCH");
  try {
    const { window, bar } = await launch();

    await changeExternally(bar);
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
    await waitForNoFileChanged(window);
    await bar.waitForHidden();
    const recent = await window.evaluate(() =>
      window.electronAPI.recentFiles.getRecentFiles(),
    );
    expect(recent.map((entry) => entry.path)).to.include(copyPath);

    await electronApp.close();
    electronApp = null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("auto-save on: paused edits aren't written until Keep my version, which writes them (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, bar } = await launch({
    preferences: AUTO_SAVE,
  });

  await openTeamTable(welcome, tableEditor);
  const disk = await changeBytesExternally(bar);
  expect(await bar.text()).to.include(PAUSED);
  expect(await bar.buttons()).not.to.include("Hide");

  await setLongName(app, tableEditor);
  await wait(1000);
  expectUnchanged(disk);

  await stubMessageBox(electronApp, CONFIRM);
  await bar.keep();
  const [box] = await waitForBoxes(1);
  expect(box).to.include({
    message: "Keep your version of CAREER-E2ETEST?",
    detail:
      "Auto-save resumes and saves your edits now. The changes made outside the editor will be lost.",
  });
  expect(box.buttons).to.deep.equal(["Keep mine", "Cancel"]);

  await bar.waitForHidden();
  await waitForNoFileChanged(window);
  await waitForWritten(disk, "Keep never saved the paused edit");
  expect(await savedLongName()).to.equal("Old York");
});

test("auto-save on: Keep my version with no edits writes nothing (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, bar } = await launch({ preferences: AUTO_SAVE });

  const disk = await changeBytesExternally(bar);
  await stubMessageBox(electronApp, CONFIRM);
  await bar.keep();
  const [box] = await waitForBoxes(1);
  expect(box.detail).to.equal(
    "Auto-save resumes. Your next edit replaces the changes made outside the editor.",
  );

  await bar.waitForHidden();
  await waitForNoFileChanged(window);
  // An auto-save would start right away; give it time to land
  await wait(3000);
  expectUnchanged(disk);
});

test("auto-save off: Keep my version writes nothing, then Save writes without asking (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, bar } = await launch();

  await editLongName(app, welcome, tableEditor);
  const disk = await changeBytesExternally(bar);
  await stubMessageBox(electronApp, CONFIRM);
  await bar.keep();
  const [box] = await waitForBoxes(1);
  expect(box.detail).to.equal(
    "Nothing is saved now. When you save, the changes made outside the editor will be lost.",
  );

  await bar.waitForHidden();
  await waitForNoFileChanged(window);
  await wait(1000);
  expectUnchanged(disk);

  await app._clickMenuItem("Save");
  await waitForWritten(disk, "Save never wrote the edit");
  expect(await savedLongName()).to.equal("Old York");
  expect(await messageBoxCalls(electronApp)).to.have.length(1);
});

test("auto-save off: Save while unresolved asks every time until Replace (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, bar } = await launch();

  await editLongName(app, welcome, tableEditor);
  const disk = await changeBytesExternally(bar);

  await stubMessageBox(electronApp, CANCEL);
  await app._clickMenuItem("Save");
  const [box] = await waitForBoxes(1);
  expect(box).to.include({
    message: "Replace CAREER-E2ETEST with your version?",
    detail: "The changes made outside the editor will be lost.",
  });
  expect(box.buttons).to.deep.equal(["Replace", "Cancel"]);
  await wait(1000);
  expectUnchanged(disk);
  expect(await fileChangedNotifications(window)).to.have.length(1);

  await app._clickMenuItem("Save");
  await waitForBoxes(2);
  await wait(500);
  expectUnchanged(disk);

  await stubMessageBox(electronApp, CONFIRM);
  await app._clickMenuItem("Save");
  await waitForBoxes(3);
  await waitForWritten(disk, "Replace never wrote the edit");
  expect(await savedLongName()).to.equal("Old York");
  await waitForNoFileChanged(window);
  await bar.waitForHidden();
});

test("auto-save off: the X hides the bar, the drawer entry stays and Save still asks (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, drawer, nav, welcome, tableEditor, bar } = await launch();

  await editLongName(app, welcome, tableEditor);
  const disk = await changeBytesExternally(bar);
  const [stored] = await fileChangedNotifications(window);
  await bar.hide();
  await bar.waitForHidden();

  await stubMessageBox(electronApp, CANCEL);
  await app._clickMenuItem("Save");
  await waitForBoxes(1);
  await wait(500);
  expectUnchanged(disk);

  await nav.openTab("Home");
  await drawer.open();
  await poll(
    () => drawer.item(stored.id).count(),
    (count) => count === 1,
    { message: "The drawer entry went away with the bar" },
  );
});
