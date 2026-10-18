const xlsx = require("xlsx");
const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../util/test");

const electron = require("../util/Electron");
const FilePaths = require("../util/FilePaths");
const TestUtil = require("../util/TestUtil");

const App = require("../models/App");
const SettingsManager = require("../models/SettingsManager");
const WelcomePage = require("../models/WelcomePage");
const TableEditorPage = require("../models/TableEditorPage");

test.beforeAll(async () => {
  // The output dir is gitignored, so it doesn't exist on a fresh checkout.
  await fs.mkdir(path.dirname(FilePaths.m22.exports.test), { recursive: true });
  await TestUtil.overwriteTestCareer();
});
test.afterAll(TestUtil.overwriteTestCareer);

test("export table e2e test", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(FilePaths.m22.career.test);
  await welcome.openTableEditor();

  // can export a table
  const tableEditor = new TableEditorPage(window);
  await tableEditor._waitForTableToLoad();
  await TestUtil.setAutoOpenExcel(app, false);
  await fs.rm(FilePaths.m22.exports.test, { force: true });
  await tableEditor.exportTable(FilePaths.m22.exports.test);
  await waitForFile(FilePaths.m22.exports.test);
  xlsxCompare(
    FilePaths.m22.exports.test,
    FilePaths.m22.exports.overallPercentage,
  );

  // can export a raw table
  await fs.rm(FilePaths.m22.exports.rawTable.test, { force: true });
  await tableEditor.exportRawTable(FilePaths.m22.exports.rawTable.test);
  await waitForFile(FilePaths.m22.exports.rawTable.test);
  await fileCompare(
    FilePaths.m22.exports.rawTable.test,
    FilePaths.m22.exports.rawTable.overallPercentage,
  );

  // can export the full FRT table
  await fs.rm(FilePaths.m22.exports.frtk.test, { force: true });
  await tableEditor.exportRawFrtkFile(FilePaths.m22.exports.frtk.test);
  await waitForFile(FilePaths.m22.exports.frtk.test);
  await fileCompare(
    FilePaths.m22.exports.frtk.test,
    FilePaths.m22.exports.frtk.compare,
  );

  // can export a more complex table
  await tableEditor.openTableById(4220);
  await fs.rm(FilePaths.m22.exports.test, { force: true });
  await tableEditor.exportTable(FilePaths.m22.exports.test);
  await waitForFile(FilePaths.m22.exports.test);
  xlsxCompare(FilePaths.m22.exports.test, FilePaths.m22.exports.player);

  await electronApp.close();
});

// Exports are written by the main process after the click resolves.
async function waitForFile(filePath, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if ((await fs.stat(filePath)).size > 0) {
        // give the writer a moment to finish
        await TestUtil.wait(250);
        return;
      }
    } catch (e) {
      /* not written yet */
    }
    await TestUtil.wait(100);
  }
  throw new Error(`Timed out waiting for ${filePath} to be written`);
}

function xlsxCompare(fileToTest, fileToCompare) {
  const testWb = xlsx.readFile(fileToTest);
  const testData = getJsonDataFromWb(testWb);

  const compareWb = xlsx.readFile(fileToCompare);
  const compareData = getJsonDataFromWb(compareWb);

  expect(testData).to.eql(compareData);

  function getJsonDataFromWb(wb) {
    return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      raw: false,
    });
  }
}

async function fileCompare(fileToTest, fileToCompare) {
  const testFile = await fs.readFile(fileToTest);
  let testHash = crypto.createHash("sha1");
  testHash.update(testFile);

  const compareFile = await fs.readFile(fileToCompare);
  let compareHash = crypto.createHash("sha1");
  compareHash.update(compareFile);

  expect(testHash.digest("hex")).to.eql(compareHash.digest("hex"));
}
