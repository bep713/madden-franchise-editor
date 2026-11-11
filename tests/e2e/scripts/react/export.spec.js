const fs = require("fs/promises");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const {
  fileCompare,
  waitForFile,
  xlsxCompare,
} = require("../../util/FileCompare");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

test("export table e2e test (react)", async ({ sandbox }) => {
  // openExcelAfterImport defaults to on, which would open Excel
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: { general: { openExcelAfterImport: [] } },
  });
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, sandbox.careerPath);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();

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
  await fs.rm(sandbox.exportPath, { force: true });
  await tableEditor.exportTable(electronApp, sandbox.exportPath);
  await waitForFile(sandbox.exportPath);
  xlsxCompare(
    sandbox.exportPath,
    FilePaths.m22.exports.overallPercentage,
  );

  // can export a raw table
  await fs.rm(sandbox.rawExportPath, { force: true });
  await tableEditor.exportRawTable(
    electronApp,
    sandbox.rawExportPath,
  );
  await waitForFile(sandbox.rawExportPath);
  await fileCompare(
    sandbox.rawExportPath,
    FilePaths.m22.exports.rawTable.overallPercentage,
  );

  // can export the full FRT file
  await fs.rm(sandbox.frtkExportPath, { force: true });
  await tableEditor.exportFrt(electronApp, sandbox.frtkExportPath);
  await waitForFile(sandbox.frtkExportPath);
  await fileCompare(
    sandbox.frtkExportPath,
    FilePaths.m22.exports.frtk.compare,
  );

  // can export a more complex table, from the menu
  await tableEditor.openTableById(4220);
  await fs.rm(sandbox.exportPath, { force: true });
  await tableEditor.exportTable(electronApp, sandbox.exportPath, {
    via: "menu",
  });
  await waitForFile(sandbox.exportPath);
  xlsxCompare(sandbox.exportPath, FilePaths.m22.exports.player);

  await electronApp.close();
});
