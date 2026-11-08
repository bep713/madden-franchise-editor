const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const { messageBoxCalls, stubMessageBox } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const SchemaManagementPage = require("../../models/react/SchemaManagementPage");
const TableEditorPage = require("../../models/react/TableEditorPage");

const BUNDLED_M22 = path.join(
  __dirname,
  "../../../../node_modules/madden-franchise/data/schemas/22/M22_329_1.gz",
);
const BUNDLED = "M22 v329.1";
const CUSTOM = "M22 v329.1 (Custom)";
const TEAM_TABLE_ID = 7482;
const ROW = 52;
// Button indexes in the page's confirm boxes
const CONFIRM = 0;
const CANCEL = 1;

test.beforeEach(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

function customSchemaPath() {
  return path.join(electron.userDataDir, "schemas", "M22_329_1.gz");
}

function copyBundledToCustom() {
  fs.mkdirSync(path.dirname(customSchemaPath()), { recursive: true });
  fs.copyFileSync(BUNDLED_M22, customSchemaPath());
}

async function getMetadata(window) {
  return window.evaluate(async () => {
    const fileId = await window.franchiseAPI.getActiveFileId();
    return window.franchiseAPI.getMetadata(fileId);
  });
}

const samePath = (a, b) =>
  !!a && !!b && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function launch() {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  return {
    electronApp,
    app,
    window,
    welcome,
    nav: new NavigationBar(window),
    schemas: new SchemaManagementPage(window),
  };
}

async function openSchemas(nav, schemas) {
  await nav.openTab("Schemas");
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
}

async function readLongName(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["LongName"]);
  return team.records[ROW].LongName;
}

test("lists the bundled schemas without a file (react)", async () => {
  const { electronApp, nav, schemas } = await launch();

  expect(await nav.tabNames()).to.deep.equal(["Home", "Schemas"]);
  await openSchemas(nav, schemas);

  const titles = await schemas.cardTitles();
  expect(titles).to.include("Madden 22 Schemas");
  expect(titles).to.include("Madden 25 Schemas");
  expect(await schemas.hasLoadedCard()).to.equal(false);
  expect(await schemas.hasRow(BUNDLED)).to.equal(true);
  expect(await schemas.isLink(BUNDLED)).to.equal(false);
  expect(await schemas.hasDeleteButton(BUNDLED)).to.equal(false);

  await electronApp.close();
});

test("loads, then deletes a custom schema (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, nav, schemas } = await launch();
  copyBundledToCustom();

  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await openSchemas(nav, schemas);

  expect(await schemas.hasRow(CUSTOM)).to.equal(true);
  expect(await schemas.hasRow(BUNDLED)).to.equal(true);

  // schemaPicker puts the custom dir first, so the copy wins the tie when
  // the file opens. Switch to the bundled one so loading the copy is a real
  // switch.
  expect(await schemas.isLoadedRow(CUSTOM)).to.equal(true);
  expect(await schemas.hasDeleteButton(CUSTOM)).to.equal(false);
  await schemas.clickSchema(BUNDLED);
  await schemas.waitForLoaded(BUNDLED);
  expect(await schemas.hasDeleteButton(CUSTOM)).to.equal(true);

  // A clean file loads without a prompt
  await stubMessageBox(electronApp, CANCEL);
  const callsBefore = (await messageBoxCalls(electronApp)).length;
  await schemas.clickSchema(CUSTOM);
  await schemas.waitForLoaded(CUSTOM);
  expect((await messageBoxCalls(electronApp)).length).to.equal(callsBefore);
  expect(await schemas.isLoadedRow(CUSTOM)).to.equal(true);
  expect(await schemas.hasDeleteButton(CUSTOM)).to.equal(false);
  expect(
    samePath((await getMetadata(window)).schemaList.path, customSchemaPath()),
  ).to.equal(true);
  // The tab stays on Schemas after the reopen
  expect(await nav.activeTabName()).to.equal("Schemas");

  // Back to the bundled one, then delete the copy
  await schemas.clickSchema(BUNDLED);
  await schemas.waitForLoaded(BUNDLED);
  expect(
    samePath(
      (await getMetadata(window)).schemaList.path,
      customSchemaPath(),
    ),
  ).to.equal(false);

  await stubMessageBox(electronApp, CONFIRM);
  await schemas.deleteSchema(CUSTOM);
  await poll(
    () => schemas.hasRow(CUSTOM),
    (has) => has === false,
    { message: "The deleted schema is still listed" },
  );
  const calls = await messageBoxCalls(electronApp);
  expect(calls[calls.length - 1].message).to.equal(`Delete schema ${CUSTOM}?`);
  expect(fs.existsSync(customSchemaPath())).to.equal(false);
  // Without its twin, the bundled label is unchanged
  expect(await schemas.hasRow(BUNDLED)).to.equal(true);

  await electronApp.close();
});

test("asks before a load drops unsaved changes (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, app, window, welcome, nav, schemas } = await launch();
  copyBundledToCustom();
  const tableEditor = new TableEditorPage(window);

  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  // The custom copy wins the tie at open
  const before = (await getMetadata(window)).schemaList.path;
  expect(samePath(before, customSchemaPath())).to.equal(true);
  const other = BUNDLED;

  // Edit a cell (auto-save is off in tests)
  await welcome.openTableEditor();
  await tableEditor.waitForTableToLoad();
  await tableEditor.openTableById(TEAM_TABLE_ID);
  const team = await app.readTable(TEAM_TABLE_ID);
  await tableEditor.grid.selectCell(
    ROW,
    "LongName",
    team.headers.map((header) => header.name),
  );
  const original = await tableEditor.grid.getTextAtSelectedCell();
  await tableEditor.grid.setTextAtSelectedCell("Old York");
  await poll(
    () => readLongName(app),
    (name) => name === "Old York",
    { message: "The edit never reached the file" },
  );

  await openSchemas(nav, schemas);

  // Cancel keeps the schema and the edit
  await stubMessageBox(electronApp, CANCEL);
  await schemas.clickSchema(other);
  await poll(
    () => messageBoxCalls(electronApp),
    (calls) => calls.length === 1,
    { message: "The unsaved-changes prompt never showed" },
  );
  const [prompt] = await messageBoxCalls(electronApp);
  expect(prompt.message).to.equal(`Load schema ${other}?`);
  expect(prompt.buttons).to.deep.equal(["Load", "Cancel"]);
  expect(samePath((await getMetadata(window)).schemaList.path, before)).to.equal(
    true,
  );
  expect(await readLongName(app)).to.equal("Old York");

  // Load reopens the file from disk, so the edit is gone
  await stubMessageBox(electronApp, CONFIRM);
  await schemas.clickSchema(other);
  await schemas.waitForLoaded(other);
  expect(samePath((await getMetadata(window)).schemaList.path, before)).to.equal(
    false,
  );
  expect(await readLongName(app)).to.equal(original);

  await electronApp.close();
});

test("the loaded card shows the mismatch and loads the expected schema (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, nav, schemas } = await launch();

  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await openSchemas(nav, schemas);

  // The test career expects v328.1, and only v329.1 is bundled
  const metadata = await getMetadata(window);
  expect(metadata.expectedSchemaVersion).to.deep.include({
    major: 328,
    minor: 1,
  });
  expect(metadata.schemaList.meta).to.deep.include({ major: 329, minor: 1 });
  expect(await schemas.status()).to.equal("mismatch");
  expect(await schemas.loadedLabel()).to.equal(BUNDLED);
  expect(await schemas.expectedLabel()).to.equal("M22 v328.1");
  expect(await schemas.hasExpectedLink()).to.equal(false);

  // A custom file named for the expected version turns it into a link once
  // the list is refreshed
  const expectedPath = path.join(
    electron.userDataDir,
    "schemas",
    "M22_328_1.gz",
  );
  fs.mkdirSync(path.dirname(expectedPath), { recursive: true });
  fs.copyFileSync(BUNDLED_M22, expectedPath);
  await schemas.refresh();
  await poll(
    () => schemas.hasExpectedLink(),
    (has) => has,
    { message: "The Expected link never showed" },
  );

  await stubMessageBox(electronApp, CONFIRM);
  await schemas.clickExpected();
  await poll(
    async () => (await getMetadata(window)).schemaList.path,
    (loadedPath) => samePath(loadedPath, expectedPath),
    { message: "The expected schema never loaded" },
  );
  await poll(
    () => schemas.isLoadedRow("M22 v328.1"),
    (loaded) => loaded,
    { message: "The expected row never showed as loaded" },
  );
  expect(await schemas.hasExpectedLink()).to.equal(false);

  await electronApp.close();
});

async function box(locator) {
  return locator.boundingBox();
}

test("the top row lines up with the grid and sticks (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, app, window, welcome, nav, schemas } = await launch();

  // Without a file, the action bar spans the grid
  await openSchemas(nav, schemas);
  const gridBox = await box(schemas.locators.grid);
  const barOnly = await box(schemas.locators.actionBar);
  expect(Math.abs(barOnly.width - gridBox.width)).to.be.at.most(1);

  await nav.openTab("Home");
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await openSchemas(nav, schemas);
  await schemas.locators.loadedCard.waitFor();

  // The loaded card is as wide as the last column of the first row
  const cards = await schemas.locators.cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width };
    }),
  );
  const firstRow = cards.filter((card) => Math.abs(card.y - cards[0].y) < 1);
  const lastColumn = firstRow[firstRow.length - 1];
  const loaded = await box(schemas.locators.loadedCard);
  const bar = await box(schemas.locators.actionBar);
  expect(firstRow.length).to.be.greaterThan(1);
  expect(Math.abs(loaded.x - lastColumn.x)).to.be.at.most(1);
  expect(Math.abs(loaded.width - lastColumn.width)).to.be.at.most(1);
  expect(bar.x + bar.width).to.be.lessThan(loaded.x);

  // Shrink the window so <main> scrolls, then check the row stays put
  const browserWindow = await electronApp.browserWindow(window);
  const [width] = await browserWindow.evaluate((win) => win.getSize());
  await browserWindow.evaluate((win, w) => win.setSize(w, 500), width);
  await poll(
    () =>
      schemas.locators.main.evaluate(
        (main) => main.scrollHeight - main.clientHeight,
      ),
    (overflow) => overflow > 50,
    { message: "<main> never overflowed" },
  );
  const barTop = (await box(schemas.locators.actionBar)).y;
  const loadedTop = (await box(schemas.locators.loadedCard)).y;
  await schemas.locators.main.evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  await poll(
    () => schemas.locators.main.evaluate((main) => main.scrollTop),
    (top) => top > 0,
    { message: "<main> did not scroll" },
  );
  expect((await box(schemas.locators.actionBar)).y).to.be.closeTo(barTop, 1);
  expect((await box(schemas.locators.loadedCard)).y).to.be.closeTo(
    loadedTop,
    1,
  );

  await app.close();
});
