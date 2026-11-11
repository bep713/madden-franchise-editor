const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

async function textAt(tableEditor, column, row) {
  await tableEditor.jumpToColumn(column, row);
  return tableEditor.grid.getTextAtSelectedCell();
}

async function textAtCell(tableEditor, row, col) {
  await tableEditor.grid.selectCellAt(row, col);
  return tableEditor.grid.getTextAtSelectedCell();
}

async function openTableEditor(electronApp, welcome, tableEditor) {
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
}

test("import table e2e test (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);

  const window = await app.getMainWindow();
  // Fail a stuck action fast instead of burning the whole test timeout
  window.setDefaultTimeout(10 * 1000);

  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();
  await TestUtil.setAutoSave(app, false);
  await openTableEditor(electronApp, welcome, tableEditor);

  // can import a small table
  await tableEditor.openTableById(4097);
  await tableEditor.importTable(
    electronApp,
    FilePaths.m22.imports.overallPercentage,
  );

  // can import a large table
  await tableEditor.openTableById(7482);
  await tableEditor.importTable(electronApp, FilePaths.m22.imports.team);

  // can import a table without every column, from the menu
  await tableEditor.openTableById(4104);
  await tableEditor.importTable(electronApp, FilePaths.m22.imports.stadium, {
    via: "menu",
  });

  // fields change on import
  await checkImportedFields();

  // fields persist after saving
  await app.saveFile();
  await app.closeFile();
  await openTableEditor(electronApp, welcome, tableEditor);
  await checkImportedFields();

  // changes persist on auto-save
  await TestUtil.setAutoSave(app, true);
  await tableEditor.openTableById(4712);
  await tableEditor.importTable(electronApp, FilePaths.m22.imports.franchise, {
    via: "menu",
  });
  expect(
    await textAt(tableEditor, "HasFantasyRoster", 0),
  ).to.equal("true");
  await TestUtil.wait(250);

  await app.closeFile();
  await openTableEditor(electronApp, welcome, tableEditor);
  await tableEditor.openTableById(4712);
  expect(
    await textAt(tableEditor, "HasFantasyRoster", 0),
  ).to.equal("true");

  // can import a raw table
  await tableEditor.openTableById(4097);
  await tableEditor.importRawTable(
    electronApp,
    FilePaths.m22.imports.rawTable.overallPercentage,
  );
  expect(await textAtCell(tableEditor, 0, 0)).to.equal("Spline - 10");
  expect(await textAtCell(tableEditor, 0, 1)).to.equal("FS");
  expect(await textAtCell(tableEditor, 1, 0)).to.equal("Spline - 11");

  await TestUtil.setAutoSave(app, false);

  await electronApp.close();

  async function checkImportedFields() {
    // updates references
    await tableEditor.openTableById(4097);
    expect(await textAtCell(tableEditor, 0, 0)).to.equal("Spline - 1");

    // updates enums
    expect(await textAtCell(tableEditor, 0, 1)).to.equal("QB");

    // updates strings
    await tableEditor.openTableById(7482);
    expect(await textAt(tableEditor, "LongName", 5)).to.equal(
      "TEST",
    );

    // updates numbers
    expect(
      await textAt(tableEditor, "SalCapNextYearSalaryReserve", 6),
    ).to.equal("500");

    // updates booleans
    expect(
      await textAt(tableEditor, "TeamRegressionOccurred", 43),
    ).to.equal("true");

    // updates table which imported single column correctly
    await tableEditor.openTableById(4104);
    expect(await textAt(tableEditor, "Name", 1)).to.equal(
      "Test Stadium Name",
    );
    expect(
      await textAt(tableEditor, "STADIUM_AIRPORTCODE", 2),
    ).to.equal("LAS");
  }
});

test("import table with auto un-empty enabled (react)", async () => {
  test.setTimeout(120 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);

  const window = await app.getMainWindow();
  window.setDefaultTimeout(10 * 1000);

  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);

  await welcome.waitForPageLoad();
  await TestUtil.setAutoSave(app, false);
  await TestUtil.setAutoUnempty(app, true);

  try {
    await openTableEditor(electronApp, welcome, tableEditor);

    // The first column of this fixture holds empty-record pointers
    await tableEditor.openTableById(7482);
    await tableEditor.importTable(electronApp, FilePaths.m22.imports.team);
    expect(await textAt(tableEditor, "LongName", 5)).to.equal(
      "TEST",
    );

    // The file should still save and reopen cleanly
    await app.saveFile();
    await app.closeFile();
    await openTableEditor(electronApp, welcome, tableEditor);
    await tableEditor.openTableById(7482);
    expect(await textAt(tableEditor, "LongName", 5)).to.equal(
      "TEST",
    );
  } finally {
    await TestUtil.setAutoUnempty(app, false);
    await electronApp.close();
  }
});
