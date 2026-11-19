const xlsx = require("xlsx");
const crypto = require("crypto");
const fs = require("fs/promises");
const { expect } = require("chai");
const { test } = require("../util/test");

const electron = require("../util/Electron");
const FilePaths = require("../util/FilePaths");
const TestUtil = require("../util/TestUtil");

const App = require("../models/App");
const SettingsManager = require("../models/SettingsManager");
const WelcomePage = require("../models/WelcomePage");
const TableEditorPage = require("../models/TableEditorPage");

test("export table e2e test", async ({ sandbox }) => {
  // openExcelAfterImport defaults to on, which would open Excel
  const electronApp = await electron.launchWithDefaultOptions({
    preferences: { general: { openExcelAfterImport: [] } },
  });
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(sandbox.careerPath);
  await welcome.openTableEditor();

  // can export a table
  const tableEditor = new TableEditorPage(window);
  await tableEditor._waitForTableToLoad();
  await fs.rm(sandbox.exportPath, { force: true });
  await tableEditor.exportTable(sandbox.exportPath);
  await waitForFile(sandbox.exportPath);
  xlsxCompare(
    sandbox.exportPath,
    FilePaths.m22.exports.overallPercentage,
  );

  // can export a raw table
  await fs.rm(sandbox.rawExportPath, { force: true });
  await tableEditor.exportRawTable(sandbox.rawExportPath);
  await waitForFile(sandbox.rawExportPath);
  await fileCompare(
    sandbox.rawExportPath,
    FilePaths.m22.exports.rawTable.overallPercentage,
  );

  // can export the full FRT table
  await fs.rm(sandbox.frtkExportPath, { force: true });
  await tableEditor.exportRawFrtkFile(sandbox.frtkExportPath);
  await waitForFile(sandbox.frtkExportPath);
  await fileCompare(
    sandbox.frtkExportPath,
    FilePaths.m22.exports.frtk.compare,
  );

  // can export a more complex table
  await tableEditor.openTableById(4220);
  await fs.rm(sandbox.exportPath, { force: true });
  await tableEditor.exportTable(sandbox.exportPath);
  await waitForFile(sandbox.exportPath);
  xlsxCompare(sandbox.exportPath, FilePaths.m22.exports.player);

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
