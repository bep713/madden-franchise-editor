const fs = require("fs/promises");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const {
  fileCompare,
  waitForFile,
  xlsxCompare,
} = require("../../util/FileCompare");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

test.beforeAll(async () => {
  // The output dir is gitignored, so it doesn't exist on a fresh checkout.
  await fs.mkdir(path.dirname(FilePaths.m22.exports.test), { recursive: true });
  await TestUtil.overwriteTestCareer();
});
test.afterAll(TestUtil.overwriteTestCareer);

test("export table e2e test (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  // Defaults to on, which would open Excel
  await TestUtil.setAutoOpenExcel(app, false);

  // the import/export menu items are enabled in the table editor
  for (const id of [
    "Export",
    "Import",
    "ExportRawTable",
    "ExportFRT",
    "ImportRawTable",
  ]) {
    expect(await app.isMenuItemEnabled(id), id).to.equal(true);
  }

  // can export a table
  await tableEditor.openTableById(4097);
  await fs.rm(FilePaths.m22.exports.test, { force: true });
  await tableEditor.exportTable(electronApp, FilePaths.m22.exports.test);
  await waitForFile(FilePaths.m22.exports.test);
  xlsxCompare(
    FilePaths.m22.exports.test,
    FilePaths.m22.exports.overallPercentage,
  );

  // can export a raw table
  await fs.rm(FilePaths.m22.exports.rawTable.test, { force: true });
  await tableEditor.exportRawTable(
    electronApp,
    FilePaths.m22.exports.rawTable.test,
  );
  await waitForFile(FilePaths.m22.exports.rawTable.test);
  await fileCompare(
    FilePaths.m22.exports.rawTable.test,
    FilePaths.m22.exports.rawTable.overallPercentage,
  );

  // can export the full FRT file
  await fs.rm(FilePaths.m22.exports.frtk.test, { force: true });
  await tableEditor.exportFrt(electronApp, FilePaths.m22.exports.frtk.test);
  await waitForFile(FilePaths.m22.exports.frtk.test);
  await fileCompare(
    FilePaths.m22.exports.frtk.test,
    FilePaths.m22.exports.frtk.compare,
  );

  // can export a more complex table, from the menu
  await tableEditor.openTableById(4220);
  await fs.rm(FilePaths.m22.exports.test, { force: true });
  await tableEditor.exportTable(electronApp, FilePaths.m22.exports.test, {
    via: "menu",
  });
  await waitForFile(FilePaths.m22.exports.test);
  xlsxCompare(FilePaths.m22.exports.test, FilePaths.m22.exports.player);

  await electronApp.close();
});
