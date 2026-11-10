const fs = require("fs");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const {
  stubMessageBox,
  stubSaveDialog,
  messageBoxCalls,
} = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const NotificationDrawer = require("../../models/react/NotificationDrawer");
const Banner = require("../../models/react/Banner");

const BANNER_MESSAGE =
  "This save file has been modified outside of this program. Do you want to reload the file?";
const TEAM_TABLE_ID = 7482;
const ROW = 52;
const CONFIRM = 0;
const CANCEL = 1;

let electronApp;

test.beforeEach(TestUtil.overwriteTestCareer);
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});
test.afterAll(TestUtil.overwriteTestCareer);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Writes the file's own bytes back, so the watcher fires without the data
// changing
function touchExternally(filePath) {
  fs.writeFileSync(filePath, fs.readFileSync(filePath));
}

// Opens the career (dismissing the mismatch banner)
async function launch() {
  electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  // Give the watcher time to start before the file is touched
  await wait(1000);
  return {
    app,
    window,
    welcome,
    tableEditor: new TableEditorPage(window),
    drawer: new NotificationDrawer(window),
    banner: new Banner(window),
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

// Touches the career and waits for the file-changed banner (1s debounce)
async function changeExternally(banner) {
  touchExternally(FilePaths.m22.career.test);
  await banner.waitForBanner("file-changed", { timeout: 10000 });
}

async function headerNames(app) {
  const team = await app.readTable(TEAM_TABLE_ID);
  return team.headers.map((header) => header.name);
}

async function readLongName(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["LongName"]);
  return team.records[ROW].LongName;
}

// Edits Team LongName in memory (auto-save is off, nothing is saved)
async function editLongName(app, welcome, tableEditor) {
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
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

test("an external change shows the banner and a drawer entry (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, drawer, banner } = await launch();

  await changeExternally(banner);
  expect(await banner.message()).to.equal(BANNER_MESSAGE);

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
  expect(await drawer.linkIds(stored.id)).to.deep.equal(["reload", "branch"]);
});

test("Reload drops unsaved edits after the confirm (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, banner } = await launch();

  await editLongName(app, welcome, tableEditor);
  await changeExternally(banner);
  await stubMessageBox(electronApp, CONFIRM);
  await banner.reload();

  await poll(
    () => readLongName(app),
    (name) => name === "New York",
    { message: "The reload never restored the on-disk value" },
  );
  const [box] = await messageBoxCalls(electronApp);
  expect(box.message).to.equal("Reload CAREER-E2ETEST?");
  await waitForNoFileChanged(window);

  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  await tableEditor.grid.selectCell(ROW, "LongName", await headerNames(app));
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("New York");
});

test("cancelling the Reload confirm keeps the edit (react)", async () => {
  test.setTimeout(120 * 1000);
  const { app, window, welcome, tableEditor, banner } = await launch();

  await editLongName(app, welcome, tableEditor);
  await changeExternally(banner);
  await stubMessageBox(electronApp, CANCEL);
  await banner.reload();

  await poll(
    () => messageBoxCalls(electronApp),
    (calls) => calls.length === 1,
    { message: "The Reload confirm never showed" },
  );
  await wait(500);
  expect(await readLongName(app)).to.equal("Old York");
  expect(await fileChangedNotifications(window)).to.have.length(1);
});

test("Branch and save new moves the file to the new path (react)", async () => {
  test.setTimeout(120 * 1000);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-branch-"));
  const branchPath = path.join(dir, "CAREER-BRANCH");
  try {
    const { window, banner } = await launch();

    await changeExternally(banner);
    await stubSaveDialog(electronApp, branchPath);
    await banner.branch();

    await poll(
      () => fs.existsSync(branchPath),
      (exists) => exists,
      { message: "Branch did not write the new file", timeout: 30000 },
    );
    await poll(
      () => windowTitle(),
      (title) => title.includes(branchPath),
      { message: "The title never showed the new path" },
    );
    await waitForNoFileChanged(window);
    const recent = await window.evaluate(() =>
      window.electronAPI.recentFiles.getRecentFiles(),
    );
    expect(recent.map((entry) => entry.path)).to.include(branchPath);

    await electronApp.close();
    electronApp = null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the banner's Dismiss removes the drawer entry (react)", async () => {
  test.setTimeout(120 * 1000);
  const { window, drawer, banner } = await launch();

  await changeExternally(banner);
  const [stored] = await fileChangedNotifications(window);
  await banner.dismiss();
  await banner.waitForHidden();
  await waitForNoFileChanged(window);

  await drawer.open();
  expect(await drawer.item(stored.id).count()).to.equal(0);
});
