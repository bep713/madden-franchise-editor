const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { stubSaveDialog } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const TableEditorPage = require("../../models/react/TableEditorPage");

const TEAM_TABLE_ID = 7482;
const ROW = 52;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

async function isMenuItemEnabled(electronApp, id) {
  return electronApp.evaluate(
    ({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).enabled,
    id,
  );
}

async function openTeamTable(electronApp, window) {
  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  return { welcome, tableEditor };
}

async function selectLongName(app, tableEditor) {
  const team = await app.readTable(TEAM_TABLE_ID);
  await tableEditor.grid.selectCell(
    ROW,
    "LongName",
    team.headers.map((header) => header.name),
  );
}

async function readLongName(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["LongName"]);
  return team.records[ROW].LongName;
}

test("edit, save, close and reopen (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const nav = new NavigationBar(window);

  const { welcome, tableEditor } = await openTeamTable(electronApp, window);

  // Save is enabled in the table editor and disabled on Home
  expect(await isMenuItemEnabled(electronApp, "Save")).to.equal(true);
  expect(await isMenuItemEnabled(electronApp, "CloseFile")).to.equal(true);
  await nav.openTab("Home");
  await welcome.waitForPageLoad();
  await poll(
    () => isMenuItemEnabled(electronApp, "Save"),
    (enabled) => enabled === false,
    { message: "Save stayed enabled on Home" },
  );
  await nav.openTab("7482 - Team");
  await tableEditor.waitForTableToLoad();
  await poll(
    () => isMenuItemEnabled(electronApp, "Save"),
    (enabled) => enabled === true,
    { message: "Save was not enabled in the table editor" },
  );

  // can edit a field
  await selectLongName(app, tableEditor);
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("New York");
  await tableEditor.grid.setTextAtSelectedCell("Old York");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Old York");
  await poll(
    () => readLongName(app),
    (name) => name === "Old York",
    { message: "The edit never reached the file" },
  );

  // can save through the File menu (Ctrl+S). autoSave is off, so only Save
  // writes the file.
  const before = await fs.stat(careerPath);
  await app._clickMenuItem("Save");
  await poll(
    async () => (await fs.stat(careerPath)).mtimeMs,
    (mtime) => mtime > before.mtimeMs,
    { message: "Save did not write the file", timeout: 30000 },
  );

  // Ctrl+S isn't tested: Playwright's synthesized keys don't trigger Electron
  // menu accelerators. The accelerator sends the same save-file event as the
  // menu click above.

  // can close the file through the File menu
  await app.closeFile();
  await welcome.waitForPageLoad();
  await poll(
    () => window.evaluate(() => window.franchiseAPI.getActiveFileId()),
    (fileId) => fileId === null,
    { message: "The file was not closed" },
  );
  expect(await isMenuItemEnabled(electronApp, "CloseFile")).to.equal(false);

  // can reopen it, and the edit was saved
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  expect(await readLongName(app)).to.equal("Old York");
  await selectLongName(app, tableEditor);
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Old York");

  await electronApp.close();
});

test("save as writes a copy and leaves the original (react)", async () => {
  const savePath = path.join(
    await fs.mkdtemp(path.join(os.tmpdir(), "mfe-save-as-")),
    "CAREER-SAVEAS",
  );
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const { tableEditor } = await openTeamTable(electronApp, window);
  await selectLongName(app, tableEditor);
  await tableEditor.grid.setTextAtSelectedCell("Old York");
  await poll(
    () => readLongName(app),
    (name) => name === "Old York",
    { message: "The edit never reached the file" },
  );

  await stubSaveDialog(electronApp, savePath);
  await app._clickMenuItem("SaveAs");
  await poll(
    () => fs.stat(savePath).then(() => true, () => false),
    (exists) => exists,
    { message: "Save As did not write the new file", timeout: 30000 },
  );
  await electronApp.close();

  // the copy has the edit and the original doesn't
  const readLongNameOf = async (filePath) => {
    const launched = await electron.launchWithDefaultOptions({ ui: "react" });
    const reopened = new App(launched);
    await openTeamTableFrom(
      launched,
      await reopened.getMainWindow(),
      filePath,
    );
    const name = await readLongName(reopened);
    await launched.close();
    return name;
  };
  expect(await readLongNameOf(savePath)).to.equal("Old York");
  expect(await readLongNameOf(careerPath)).to.equal("New York");

  await fs.rm(path.dirname(savePath), { recursive: true, force: true });
});

async function openTeamTableFrom(electronApp, window, filePath) {
  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, filePath);
  return { welcome, tableEditor };
}
