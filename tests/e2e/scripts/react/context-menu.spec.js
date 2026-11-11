const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const TableEditorPage = require("../../models/react/TableEditorPage");

const OVERALL_PERCENTAGE = 4097;
const PLAYER = 4220;
const FILE_POLL_OPTIONS = { timeout: 30000 };

const FIND = "Find references to this record...";
const OPEN_TAB = "Open this reference in a new tab";
const SET_EMPTY = "Set selected record(s) as empty";
const SET_NEXT = "Set as next empty record to use";

// Player rows (see cell-edit.spec.js): 373-376 are empty
const EMPTY_PLAYER_ROW = 375;
const LAST_PLAYER_ROW = 3959; // nothing references it

let app;
let electronApp;
let window;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});
test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});

async function openTable(tableId) {
  electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  app = new App(electronApp);
  window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(tableId);
  return tableEditor;
}

async function waitForTable(tableEditor, name) {
  await poll(
    () => tableEditor.getSelectedTableName(),
    (selected) => selected === name,
    { message: `${name} never loaded` },
  );
  await tableEditor.waitForTableToLoad();
}

// The record number highlighted in the grid's row header
async function selectedRowHeader() {
  const header = window.locator(".ht_clone_inline_start tbody th.ht__highlight");
  return (await header.first().innerText()).trim();
}

// The field name highlighted in the grid's column header
async function selectedColumnHeader() {
  const header = window.locator(".ht_clone_top thead th.ht__highlight .colHeader");
  return (await header.first().innerText()).trim();
}

// field: any one column, so the whole table isn't sent through evaluate
async function readEmptyRows(tableId, field) {
  return (await app.readTable(tableId, [field])).emptyRecordIndices;
}

async function waitForEmptyRows(tableId, field, predicate, message) {
  return poll(() => readEmptyRows(tableId, field), predicate, {
    ...FILE_POLL_OPTIONS,
    message,
  });
}

// Selects a cell in the grid, then opens the menu there, reads which items
// are enabled and closes it again
async function enabledItems(tableEditor, labels) {
  await tableEditor.contextMenu.open();
  const enabled = {};
  for (const label of labels) {
    enabled[label] = await tableEditor.contextMenu.isEnabled(label);
  }
  await tableEditor.contextMenu.close();
  return enabled;
}

test("the menu has v4's items in order (react)", async () => {
  const tableEditor = await openTable(OVERALL_PERCENTAGE);
  await tableEditor.grid.selectCellAt(5, 0);
  await tableEditor.contextMenu.open();
  expect(await tableEditor.contextMenu.labels()).to.deep.equal([
    FIND,
    OPEN_TAB,
    SET_EMPTY,
    "Advanced...",
  ]);
});

test("Find references lists the referencing records and opens one (react)", async () => {
  test.setTimeout(120 * 1000);
  const tableEditor = await openTable(OVERALL_PERCENTAGE);
  const { grid, references } = tableEditor;

  // record 5 is referenced from one table
  await grid.selectCellAt(5, 0);
  const sourceText = await grid.getTextAtSelectedCell();
  await tableEditor.findReferencesToSelectedRecord();

  expect(await references.headerText()).to.equal(
    "The following tables reference (4097) OverallPercentage - Record #5:",
  );
  const items = await references.items();
  expect(items.length).to.be.greaterThan(0);
  for (const item of items) {
    expect(item).to.match(/^\(\d+\) \S.* Record #\d+( · \S+)?$/);
  }
  const [target] = await references.itemTargets();
  expect(target.fieldName).to.be.a("string");

  /** clicking a row opens the referencing record in this tab, at its field */
  const tabsBefore = await new NavigationBar(window).tabNames();
  await references.clickItemAt(0);
  await references.waitForClose();
  await poll(
    () => tableEditor.getSelectedTableName(),
    (name) => name.startsWith(`${target.tableId} - `),
    { message: "The reference was not opened" },
  );
  await tableEditor.waitForTableToLoad();
  await poll(selectedRowHeader, (text) => text === String(target.recordIndex), {
    message: `Record ${target.recordIndex} was not selected`,
  });
  await poll(selectedColumnHeader, (text) => text === target.fieldName, {
    message: `Field ${target.fieldName} was not selected`,
  });
  expect(await new NavigationBar(window).tabCount()).to.equal(
    tabsBefore.length,
  );

  /** Back returns to the source cell */
  await tableEditor.clickBack();
  await waitForTable(tableEditor, `${OVERALL_PERCENTAGE} - OverallPercentage`);
  await poll(
    () => grid.getTextAtSelectedCell(),
    (text) => text === sourceText,
    { message: "Back did not return to the source cell" },
  );
});

test("Find references rows open in a new tab with ctrl+click or middle-click (react)", async () => {
  test.setTimeout(120 * 1000);
  const tableEditor = await openTable(OVERALL_PERCENTAGE);
  const nav = new NavigationBar(window);
  const { grid, references } = tableEditor;
  const tabCount = await nav.tabCount();

  /** ctrl+click opens an active new tab */
  await grid.selectCellAt(5, 0);
  await tableEditor.findReferencesToSelectedRecord();
  const [target] = await references.itemTargets();
  await references.clickItemAt(0, { modifiers: ["Control"] });
  await references.waitForClose();
  await poll(() => nav.tabCount(), (count) => count === tabCount + 1, {
    message: "ctrl+click did not open a tab",
  });
  await poll(
    () => tableEditor.getSelectedTableName(),
    (name) => name.startsWith(`${target.tableId} - `),
    { message: "The new tab never became active" },
  );
  await tableEditor.waitForTableToLoad();
  await poll(selectedRowHeader, (text) => text === String(target.recordIndex), {
    message: `Record ${target.recordIndex} was not selected`,
  });
  await poll(selectedColumnHeader, (text) => text === target.fieldName, {
    message: `Field ${target.fieldName} was not selected`,
  });

  /** middle-click opens a background tab */
  await nav.openTab(`${OVERALL_PERCENTAGE} - OverallPercentage`);
  await waitForTable(tableEditor, `${OVERALL_PERCENTAGE} - OverallPercentage`);
  const activeBefore = await nav.activeTabName();
  await grid.selectCellAt(5, 0);
  await tableEditor.findReferencesToSelectedRecord();
  await references.clickItemAt(0, { button: "middle" });
  await references.waitForClose();
  await poll(() => nav.tabCount(), (count) => count === tabCount + 2, {
    message: "middle-click did not open a tab",
  });
  expect(await nav.activeTabName()).to.equal(activeBefore);
});

test("Find references says when there are none, and Esc closes it (react)", async () => {
  const tableEditor = await openTable(PLAYER);
  const { references } = tableEditor;

  await tableEditor.jumpToColumn("LastName", LAST_PLAYER_ROW);
  await tableEditor.findReferencesToSelectedRecord();
  expect(await references.hasText("No references.")).to.equal(true);
  expect(await references.items()).to.deep.equal([]);

  await window.keyboard.press("Escape");
  await references.waitForClose();
});

test("menu items are disabled when they don't apply (react)", async () => {
  const tableEditor = await openTable(OVERALL_PERCENTAGE);
  const { grid } = tableEditor;

  // a reference cell: everything that applies is on
  await grid.selectCellAt(5, 0);
  let enabled = await enabledItems(tableEditor, [FIND, OPEN_TAB, SET_EMPTY]);
  expect(enabled).to.deep.equal({
    [FIND]: true,
    [OPEN_TAB]: true,
    [SET_EMPTY]: true,
  });

  // not a reference cell
  await grid.selectCellAt(5, 1);
  enabled = await enabledItems(tableEditor, [FIND, OPEN_TAB]);
  expect(enabled[OPEN_TAB]).to.equal(false);
  expect(enabled[FIND]).to.equal(true);

  // two rows
  await grid.selectCellAt(5, 0);
  await window.keyboard.press("Shift+ArrowDown");
  enabled = await enabledItems(tableEditor, [FIND, OPEN_TAB, SET_EMPTY]);
  expect(enabled[FIND]).to.equal(false);
  expect(enabled[OPEN_TAB]).to.equal(false);
  expect(enabled[SET_EMPTY]).to.equal(true);
});

test("Set as empty is disabled when every selected record is empty (react)", async () => {
  const tableEditor = await openTable(PLAYER);

  await tableEditor.jumpToColumn("LastName", EMPTY_PLAYER_ROW);
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(true);
  const enabled = await enabledItems(tableEditor, [SET_EMPTY, "Advanced..."]);
  expect(enabled[SET_EMPTY]).to.equal(false);

  // a mix of empty and non-empty rows is still allowed
  await tableEditor.jumpToColumn("LastName", EMPTY_PLAYER_ROW - 3);
  await window.keyboard.press("Shift+ArrowDown");
  await window.keyboard.press("Shift+ArrowDown");
  await window.keyboard.press("Shift+ArrowDown");
  expect(
    (await enabledItems(tableEditor, [SET_EMPTY]))[SET_EMPTY],
  ).to.equal(true);
});

test("Open this reference in a new tab opens a background tab (react)", async () => {
  const tableEditor = await openTable(OVERALL_PERCENTAGE);
  const nav = new NavigationBar(window);

  await tableEditor.grid.selectCellAt(5, 0);
  expect(await tableEditor.grid.getTextAtSelectedCell()).to.equal(
    "Spline - 5",
  );
  const before = await nav.tabNames();
  await tableEditor.openSelectedReferenceInNewTab();

  await poll(() => nav.tabNames(), (names) => names.length === before.length + 1, {
    message: "No tab was opened",
  });
  const after = await nav.tabNames();
  expect(after.filter((name) => name === "7022 - Spline")).to.have.length(1);
  // the current tab didn't change
  expect(await nav.activeTabName()).to.equal(
    `${OVERALL_PERCENTAGE} - OverallPercentage`,
  );
  expect(await tableEditor.getSelectedTableName()).to.equal(
    `${OVERALL_PERCENTAGE} - OverallPercentage`,
  );
});

test("Set as next empty record to use moves the chain head (react)", async () => {
  test.setTimeout(120 * 1000);
  let tableEditor = await openTable(PLAYER);

  // not on a record that isn't empty
  await tableEditor.jumpToColumn("LastName", 0);
  expect(
    (await enabledItems(tableEditor, ["Advanced..."]))["Advanced..."],
  ).to.equal(true);
  await tableEditor.contextMenu.open();
  await tableEditor.contextMenu.hoverAdvanced();
  expect(await tableEditor.contextMenu.isEnabled(SET_NEXT)).to.equal(false);
  await tableEditor.contextMenu.close();

  const before = await app.readTable(PLAYER, ["LastName"]);
  expect(before.emptyRecordIndices).to.include.members([373, 374, 375]);

  // on an empty one
  await tableEditor.jumpToColumn("LastName", EMPTY_PLAYER_ROW);
  await tableEditor.contextMenu.open();
  await tableEditor.contextMenu.hoverAdvanced();
  expect(await tableEditor.contextMenu.isEnabled(SET_NEXT)).to.equal(true);
  await tableEditor.contextMenu.close();
  await tableEditor.setSelectedAsNextEmptyRecord();

  // records before the new head stop being empty
  const isHeadMoved = (table) =>
    table.header.nextRecordToUse === EMPTY_PLAYER_ROW;
  await poll(
    () => app.readTable(PLAYER, ["LastName"]),
    (table) =>
      isHeadMoved(table) &&
      !table.emptyRecordIndices.includes(373) &&
      !table.emptyRecordIndices.includes(374),
    { ...FILE_POLL_OPTIONS, message: "The chain head never moved to 375" },
  );
  expect(await readEmptyRows(PLAYER, "LastName")).to.include(
    EMPTY_PLAYER_ROW,
  );

  await tableEditor.jumpToColumn("LastName", 373);
  await poll(
    () => tableEditor.grid.isSelectedCellEmpty(),
    (empty) => empty === false,
    { message: "Record 373 still has the empty styling" },
  );
  await tableEditor.jumpToColumn("LastName", EMPTY_PLAYER_ROW);
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(true);

  // it survives a save and reopen
  await app.saveFile();
  await electronApp.close();
  tableEditor = await openTable(PLAYER);
  const after = await app.readTable(PLAYER, ["LastName"]);
  expect(after.header.nextRecordToUse).to.equal(EMPTY_PLAYER_ROW);
  expect(after.emptyRecordIndices).to.not.include(373);
  expect(after.emptyRecordIndices).to.not.include(374);
  await tableEditor.jumpToColumn("LastName", 373);
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(false);
});

test("Set as empty works on a record column in the inverted view (react)", async () => {
  const tableEditor = await openTable(OVERALL_PERCENTAGE);
  await tableEditor.switchOrientation();

  await tableEditor.jumpToColumn("PlayerPosition", 3);
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(false);
  await tableEditor.setSelectedRecordToEmpty();

  await poll(
    () => tableEditor.grid.isSelectedCellEmpty(),
    (empty) => empty === true,
    { message: "The record column never showed as empty" },
  );
  await waitForEmptyRows(
    OVERALL_PERCENTAGE,
    "PlayerPosition",
    (rows) => rows.length === 1 && rows[0] === 3,
    "Record 3 never became empty in the file",
  );

  // the other orientation sees it too
  await tableEditor.switchOrientation();
  await tableEditor.jumpToColumn("PlayerPosition", 3);
  expect(await tableEditor.grid.isSelectedCellEmpty()).to.equal(true);
});
