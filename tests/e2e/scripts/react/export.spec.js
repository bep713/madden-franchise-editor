const fs = require("fs/promises");
const path = require("path");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const { waitForFile, xlsxCompare } = require("../../util/FileCompare");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

test.beforeAll(async () => {
  // The output dir is gitignored, so it doesn't exist on a fresh checkout.
  await fs.mkdir(path.dirname(FilePaths.m22.exports.test), { recursive: true });
  await TestUtil.overwriteTestCareer();
});
test.afterAll(TestUtil.overwriteTestCareer);

// Raw table and FRT export have no React UI yet (03b).
test("export table e2e test (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await welcome.openTableEditor();

  // can export a table
  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  await fs.rm(FilePaths.m22.exports.test, { force: true });
  await tableEditor.exportTable(electronApp, FilePaths.m22.exports.test);
  await waitForFile(FilePaths.m22.exports.test);
  xlsxCompare(
    FilePaths.m22.exports.test,
    FilePaths.m22.exports.overallPercentage,
  );

  // can export a more complex table
  await tableEditor.openTableById(4220);
  await fs.rm(FilePaths.m22.exports.test, { force: true });
  await tableEditor.exportTable(electronApp, FilePaths.m22.exports.test);
  await waitForFile(FilePaths.m22.exports.test);
  xlsxCompare(FilePaths.m22.exports.test, FilePaths.m22.exports.player);

  await electronApp.close();
});
