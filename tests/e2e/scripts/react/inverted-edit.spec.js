const fs = require("fs/promises");
const path = require("path");
const xlsx = require("xlsx");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const { waitForFile } = require("../../util/FileCompare");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const NavigationBar = require("../../models/react/NavigationBar");
const ReferenceEditor = require("../../models/react/ReferenceEditor");

// Editing in the Switch Orientation view (03e). Cells are reached with
// jumpToColumn, which takes a record and a field in either orientation.
const TEAM = 7482;
const OVERALL_PERCENTAGE = 4097;
const PLAYER = 4220;
const MAX_BULK_PASTE_MS = 15000; // as in cell-edit.spec.js
const FILE_POLL_OPTIONS = { timeout: 30000 };

let app;
let electronApp;
let window;

let sandbox;
let careerPath;
test.beforeEach(({ sandbox: testSandbox }) => {
  sandbox = testSandbox;
  careerPath = sandbox.careerPath;
});
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});

async function openTableEditor(preferences) {
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences,
  });
  app = new App(electronApp);
  window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  return tableEditor;
}

async function openInverted(tableId, preferences) {
  const tableEditor = await openTableEditor(preferences);
  await tableEditor.openTableById(tableId);
  await tableEditor.switchOrientation();
  return tableEditor;
}

async function textAt(tableEditor, fieldName, recordIndex) {
  await tableEditor.jumpToColumn(fieldName, recordIndex);
  return tableEditor.grid.getTextAtSelectedCell();
}

async function readField(tableId, fieldName) {
  const table = await app.readTable(tableId, [fieldName]);
  return table.records.map((record) => record[fieldName]);
}

async function waitForFieldValue(tableId, fieldName, recordIndex, expected) {
  return poll(
    async () => (await readField(tableId, fieldName))[recordIndex],
    (value) => String(value) === String(expected),
    {
      ...FILE_POLL_OPTIONS,
      message: `${fieldName} of record ${recordIndex} never became ${expected}`,
    },
  );
}

async function waitForGridText(tableEditor, fieldName, recordIndex, expected) {
  return poll(
    () => textAt(tableEditor, fieldName, recordIndex),
    (text) => text === expected,
    { message: `The grid never showed ${expected}` },
  );
}

async function undo(tableEditor) {
  await tableEditor.grid.undo();
}

test("a text edit in the inverted view is saved (react)", async () => {
  const tableEditor = await openInverted(TEAM);

  await tableEditor.jumpToColumn("LongName", 5);
  await tableEditor.grid.setTextAtSelectedCell("Inverted");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("Inverted");
  await waitForFieldValue(TEAM, "LongName", 5, "Inverted");

  // the normal view shows it at record 5
  await tableEditor.switchOrientation();
  expect(await textAt(tableEditor, "LongName", 5)).to.equal("Inverted");
});

test("a bool dropdown edit in the inverted view is saved (react)", async () => {
  const tableEditor = await openInverted(TEAM);
  const original = (await readField(TEAM, "TeamRegressionOccurred"))[5];
  const next = String(original) === "true" ? "false" : "true";

  await tableEditor.jumpToColumn("TeamRegressionOccurred", 5);
  await tableEditor.grid.chooseDropdownOptionAtSelectedCell(next);
  await waitForFieldValue(TEAM, "TeamRegressionOccurred", 5, next);
  await waitForGridText(tableEditor, "TeamRegressionOccurred", 5, next);
});

test("undo and redo work across an orientation switch (react)", async () => {
  test.setTimeout(120 * 1000);
  const tableEditor = await openInverted(TEAM);
  const originals = await readField(TEAM, "LongName");
  const recordCount = originals.length;

  /** edited inverted, undone normal */
  await tableEditor.jumpToColumn("LongName", 5);
  await tableEditor.grid.setTextAtSelectedCell("Across");
  await waitForFieldValue(TEAM, "LongName", 5, "Across");
  await tableEditor.switchOrientation();
  await undo(tableEditor);
  await waitForFieldValue(TEAM, "LongName", 5, originals[5]);
  await waitForGridText(tableEditor, "LongName", 5, originals[5]);
  // nothing was added or removed
  expect((await readField(TEAM, "LongName")).length).to.equal(recordCount);
  await tableEditor.grid.redo();
  await waitForFieldValue(TEAM, "LongName", 5, "Across");
  await waitForGridText(tableEditor, "LongName", 5, "Across");

  /** edited normal, undone inverted */
  await tableEditor.jumpToColumn("LongName", 6);
  await tableEditor.grid.setTextAtSelectedCell("Reverse");
  await waitForFieldValue(TEAM, "LongName", 6, "Reverse");
  await tableEditor.switchOrientation();
  await undo(tableEditor);
  await waitForFieldValue(TEAM, "LongName", 6, originals[6]);
  await waitForGridText(tableEditor, "LongName", 6, originals[6]);

  /** a two-cell paste in normal, undone inverted */
  await tableEditor.switchOrientation();
  await tableEditor.jumpToColumn("LongName", 10);
  await tableEditor.watchForLoader();
  await app.pasteText(tableEditor.window, "Paste10\nPaste11");
  await tableEditor.waitForLoaderToShowAndHide();
  await waitForFieldValue(TEAM, "LongName", 11, "Paste11");

  await tableEditor.switchOrientation();
  await tableEditor.watchForLoader();
  await undo(tableEditor);
  await tableEditor.waitForLoaderToShowAndHide();
  const names = await readField(TEAM, "LongName");
  expect(names.slice(10, 12)).to.deep.equal(originals.slice(10, 12));
  expect(names.length).to.equal(recordCount);
  await waitForGridText(tableEditor, "LongName", 10, originals[10]);
  await waitForGridText(tableEditor, "LongName", 11, originals[11]);
});

test("an invalid inverted value is reverted and never replayed (react)", async () => {
  const tableEditor = await openInverted(TEAM);
  const team = await app.readTable(TEAM);
  // An enum field rejects names that aren't members
  const enumField = team.headers.find((header) => header.enum).name;
  const originalEnum = team.records[5][enumField];
  const originalName = team.records[5].LongName;

  await tableEditor.jumpToColumn("LongName", 5);
  await tableEditor.grid.setTextAtSelectedCell("BeforeInvalid");
  await waitForFieldValue(TEAM, "LongName", 5, "BeforeInvalid");

  await tableEditor.jumpToColumn(enumField, 5);
  await app.pasteText(tableEditor.window, "NotAMember");
  await waitForGridText(tableEditor, enumField, 5, String(originalEnum));
  expect((await readField(TEAM, enumField))[5]).to.equal(originalEnum);

  // Ctrl+Z skips the rejected value and undoes the edit before it
  await undo(tableEditor);
  await waitForFieldValue(TEAM, "LongName", 5, originalName);
  expect((await readField(TEAM, enumField))[5]).to.equal(originalEnum);
  expect(await textAt(tableEditor, enumField, 5)).to.equal(
    String(originalEnum),
  );
});

test("the inverted field-name column can't be edited (react)", async () => {
  const tableEditor = await openInverted(TEAM);
  const original = (await readField(TEAM, "LongName"))[0];

  await tableEditor.jumpToColumn("LongName", 0);
  await window.keyboard.press("ArrowLeft");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("LongName");
  await window.keyboard.type("X");
  await window.keyboard.press("Enter");
  await window.keyboard.press("ArrowUp");
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal("LongName");
  expect((await readField(TEAM, "LongName"))[0]).to.equal(original);
});

test("the reference editor works in the inverted view (react)", async () => {
  const tableEditor = await openInverted(OVERALL_PERCENTAGE);

  await tableEditor.jumpToColumn("PercentageSpline", 0);
  await tableEditor.grid.editReferenceAtSelectedCell();
  const referenceEditor = new ReferenceEditor(window);
  await referenceEditor.waitForOpen();
  await referenceEditor.setTableById(4146);
  await referenceEditor.setRowIndex(25);
  await referenceEditor.change();
  await referenceEditor.close();

  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    "SeasonGame - 25",
  );
  await waitForFieldValue(
    OVERALL_PERCENTAGE,
    "PercentageSpline",
    0,
    "00100000011001000000000000011001",
  );
});

test("pasting 2,500 records of one field inverted stays responsive (react)", async () => {
  const tableEditor = await openInverted(PLAYER);
  const lastNames = Array.from({ length: 2500 }, (_, i) => `Inv${i}`);

  await tableEditor.jumpToColumn("LastName", 0);
  // One line of tab-separated values pastes across the record columns
  await tableEditor.watchForLoader();
  const start = Date.now();
  await app.pasteText(tableEditor.window, lastNames.join("\t"));
  await tableEditor.waitForLoaderToShowAndHide();
  expect(Date.now() - start).to.be.below(MAX_BULK_PASTE_MS);

  expect((await readField(PLAYER, "LastName")).slice(0, 2500)).to.deep.equal(
    lastNames,
  );
  expect(await textAt(tableEditor, "LastName", 2499)).to.equal("Inv2499");
});

test("the orientation belongs to the tab's current table (react)", async () => {
  test.setTimeout(120 * 1000);
  const tableEditor = await openInverted(TEAM);
  const nav = new NavigationBar(window);

  // a table opened from the sidebar starts normal, and so does going back
  await tableEditor.openTableById(OVERALL_PERCENTAGE);
  expect(await tableEditor.isInverted()).to.equal(false);
  await tableEditor.openTableById(TEAM);
  expect(await tableEditor.isInverted()).to.equal(false);

  // a new tab starts normal; the first tab is still inverted, on its cell
  await tableEditor.switchOrientation();
  await tableEditor.jumpToColumn("LongName", 5);
  const selectedText = await tableEditor.grid.getTextAtSelectedCell();
  const teamTab = await nav.activeTabName();
  await tableEditor.ctrlClickSidebarTable(OVERALL_PERCENTAGE);
  await nav.waitForActiveTab(`${OVERALL_PERCENTAGE} - OverallPercentage`);
  await tableEditor.waitForTableToLoad();
  expect(await tableEditor.isInverted()).to.equal(false);

  await nav.openTab(teamTab);
  await nav.waitForActiveTab(teamTab);
  await tableEditor.waitForTableToLoad();
  await poll(
    () => tableEditor.isInverted(),
    (inverted) => inverted,
    { message: "The Team tab was not restored inverted" },
  );
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    selectedText,
  );
  // the selected cell is LongName of record 5: the "Record 6" column
  await poll(
    () =>
      window
        .locator(".ht_clone_top thead th.ht__highlight .colHeader")
        .first()
        .innerText(),
    (text) => text.trim() === "Record 6",
    { message: "Record 5 was not selected" },
  );
});

test("export and import from the inverted view use the normal layout (react)", async () => {
  test.setTimeout(150 * 1000);
  // openExcelAfterImport defaults to on, which would open Excel
  let tableEditor = await openInverted(TEAM, {
    general: { openExcelAfterImport: [] },
  });

  // 1-3. the export is in the normal layout: a row per record
  await fs.rm(sandbox.exportPath, { force: true });
  await tableEditor.exportTable(electronApp, sandbox.exportPath);
  await waitForFile(sandbox.exportPath);
  const team = await app.readTable(TEAM);
  const workbook = xlsx.readFile(sandbox.exportPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  expect(rows[0]).to.deep.equal(team.headers.map((header) => header.name));
  expect(rows.length - 1).to.equal(team.records.length);

  // 4. edited by another program
  const longNameCol = rows[0].indexOf("LongName");
  rows[1 + 5][longNameCol] = "InvertedImport";
  const edited = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    edited,
    xlsx.utils.aoa_to_sheet(rows),
    workbook.SheetNames[0],
  );
  const importFile = path.join(sandbox.dir, "inverted-import.xlsx");
  xlsx.writeFile(edited, importFile);

  // 5-6. the import updates the table
  await tableEditor.importTable(electronApp, importFile);
  await waitForFieldValue(TEAM, "LongName", 5, "InvertedImport");

  // 7. still inverted, showing the new value
  expect(await tableEditor.isInverted()).to.equal(true);
  expect(await textAt(tableEditor, "LongName", 5)).to.equal("InvertedImport");

  // 8. and in the normal view
  await tableEditor.switchOrientation();
  expect(await textAt(tableEditor, "LongName", 5)).to.equal("InvertedImport");

  // 9. saved; a reopened table starts normal
  await app.saveFile();
  await electronApp.close();
  tableEditor = await openTableEditor();
  await tableEditor.openTableById(TEAM);
  expect(await tableEditor.isInverted()).to.equal(false);
  expect(await textAt(tableEditor, "LongName", 5)).to.equal("InvertedImport");
});

test("a paste past the grid's edge is clipped in both views (react)", async () => {
  const tableEditor = await openTableEditor();
  await tableEditor.openTableById(TEAM);
  const recordCount = (await readField(TEAM, "LongName")).length;
  const selectedColumnHeader = window.locator(
    ".ht_clone_top thead th.ht__highlight .colHeader",
  );

  // normal: four rows pasted onto the last two records
  await tableEditor.jumpToColumn("LongName", recordCount - 2);
  await tableEditor.watchForLoader();
  await app.pasteText(tableEditor.window, ["N1", "N2", "N3", "N4"].join("\n"));
  await tableEditor.waitForLoaderToShowAndHide();
  const names = await readField(TEAM, "LongName");
  expect(names.length).to.equal(recordCount);
  expect(names.slice(-2)).to.deep.equal(["N1", "N2"]);

  // no rows were added, so the inverted view has no extra record columns
  await tableEditor.switchOrientation();
  await window.keyboard.press("Control+End");
  await poll(
    async () => (await selectedColumnHeader.first().innerText()).trim(),
    (text) => text === `Record ${recordCount}`,
    { message: "The inverted grid has extra record columns" },
  );

  // inverted: four records pasted onto the last two
  await tableEditor.jumpToColumn("ShortName", recordCount - 2);
  await tableEditor.watchForLoader();
  await app.pasteText(tableEditor.window, "I1\tI2\tI3\tI4");
  await tableEditor.waitForLoaderToShowAndHide();
  const shortNames = await readField(TEAM, "ShortName");
  expect(shortNames.length).to.equal(recordCount);
  expect(shortNames.slice(-2)).to.deep.equal(["I1", "I2"]);
  await window.keyboard.press("Control+End");
  await poll(
    async () => (await selectedColumnHeader.first().innerText()).trim(),
    (text) => text === `Record ${recordCount}`,
    { message: "The inverted paste added record columns" },
  );
});
