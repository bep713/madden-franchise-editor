const fs = require("fs/promises");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");
const NavigationBar = require("../../models/react/NavigationBar");

// The default pins, in pins.spec's order
const DEFAULT_PIN_IDS = [4220, 4272, 4712, 7388];

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

async function launch({ compact }) {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: compact ? { general: { tableEditorSpacing: "compact" } } : {},
  });
  const window = await new App(electronApp).getMainWindow();
  const welcome = new WelcomePage(window);
  const tableEditor = new TableEditorPage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  return { electronApp, window, tableEditor, nav: new NavigationBar(window) };
}

async function waitForTable(tableEditor, name) {
  await poll(
    () => tableEditor.getSelectedTableName(),
    (selected) => selected === name,
    { message: `${name} never loaded` },
  );
  await tableEditor.waitForTableToLoad();
}

// The selected cell's record index (its row header, in the left clone),
// column header and text
async function selectedCell(window) {
  return window.evaluate(() => {
    const td = document.querySelector(".ht_master td.current:not(.listbox)");
    if (!td) {
      return null;
    }
    const tr = td.parentElement;
    const rowIndex = [...tr.parentElement.children].indexOf(tr);
    const rowHeader = document.querySelectorAll(
      ".ht_clone_inline_start tbody tr",
    )[rowIndex];
    const colHeader = document.querySelectorAll(
      ".ht_master thead tr:last-child th",
    )[td.cellIndex];
    return {
      row: rowHeader?.innerText.trim(),
      col: colHeader?.innerText.trim(),
      text: td.innerText.trim(),
    };
  });
}

async function firstRowHeight(window) {
  return window.evaluate(
    () =>
      document
        .querySelector(".ht_master tbody tr:nth-of-type(2) td")
        .getBoundingClientRect().height,
  );
}

test("compact spacing shows the table picker with pins first (react)", async () => {
  const { tableEditor } = await launch({ compact: true });

  expect(await tableEditor.isSidebarVisible()).to.equal(false);
  expect(await tableEditor.getPickerText()).to.equal("4096");
  expect(await tableEditor.getSpacingToggleText()).to.equal(
    "Switch to default spacing",
  );

  await tableEditor.locators.picker.click();
  await tableEditor.locators.pickerOptions.first().waitFor();
  const ids = await tableEditor.getPickerTableIds();
  expect(ids.slice(0, DEFAULT_PIN_IDS.length)).to.deep.equal(DEFAULT_PIN_IDS);
  // Then the full list, without the pinned tables
  expect(ids[DEFAULT_PIN_IDS.length]).to.equal(4096);

  await tableEditor.closePicker();
  await tableEditor.locators.pickerOptions
    .first()
    .waitFor({ state: "detached" });
  expect(await tableEditor.getPickerText()).to.equal("4096");
});

test("the picker opens a table in the current tab with Enter (react)", async () => {
  const { tableEditor } = await launch({ compact: true });

  await tableEditor.pickTable("OverallPercentage");
  await waitForTable(tableEditor, "4097 - OverallPercentage");
  await poll(
    () => tableEditor.isBackEnabled(),
    (enabled) => enabled,
    { message: "Back never became enabled" },
  );

  await tableEditor.clickBack();
  await waitForTable(tableEditor, "4096");
});

test("ctrl+clicking a picker option opens a new tab (react)", async () => {
  const { tableEditor, nav } = await launch({ compact: true });
  await nav.waitForActiveTab("4096");

  await tableEditor.pickTable("Player", {
    id: 4220,
    modifiers: ["Control"],
  });
  await nav.waitForActiveTab("4220 - Player");
  await waitForTable(tableEditor, "4220 - Player");

  await nav.openTab("4096");
  await nav.waitForActiveTab("4096");
  await waitForTable(tableEditor, "4096");
});

test("the spacing toggle switches layouts and keeps the cell (react)", async () => {
  const { window, tableEditor } = await launch({ compact: false });
  const prefsFile = path.join(electron.userDataDir, "preferences.json");
  const savedSpacing = async () =>
    JSON.parse(await fs.readFile(prefsFile, "utf8")).general
      .tableEditorSpacing;

  await tableEditor.openTableById(4220);
  expect(await tableEditor.isSidebarVisible()).to.equal(true);
  expect(await tableEditor.getSpacingToggleText()).to.equal(
    "Switch to compact spacing",
  );
  await tableEditor.grid.selectCellAt(3, 2);
  const before = await selectedCell(window);
  expect(before.row).to.equal("3");
  const defaultHeight = await firstRowHeight(window);

  await tableEditor.toggleSpacing();
  await poll(
    () => tableEditor.isSidebarVisible(),
    (visible) => !visible,
    { message: "The sidebar never hid" },
  );
  expect(await tableEditor.getPickerText()).to.equal("4220 - Player");
  expect(await selectedCell(window)).to.deep.equal(before);
  await poll(savedSpacing, (spacing) => spacing === "compact", {
    message: "tableEditorSpacing was never saved as compact",
  });
  const compactHeight = await poll(
    () => firstRowHeight(window),
    (height) => height < defaultHeight,
    { message: `Compact rows are not shorter than ${defaultHeight}px` },
  );
  expect(compactHeight).to.be.lessThan(defaultHeight);

  await tableEditor.toggleSpacing();
  await poll(
    () => tableEditor.isSidebarVisible(),
    (visible) => visible,
    { message: "The sidebar never came back" },
  );
  expect(await tableEditor.getSelectedTableName()).to.equal("4220 - Player");
  expect(await selectedCell(window)).to.deep.equal(before);
  await poll(savedSpacing, (spacing) => spacing === "default", {
    message: "tableEditorSpacing was never saved as default",
  });
});
