const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");
const { stubMessageBox } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const SchemaManagementPage = require("../../models/react/SchemaManagementPage");
const SchemaViewer = require("../../models/react/SchemaViewer");

const BUNDLED_M22 = path.join(
  __dirname,
  "../../../../node_modules/madden-franchise/data/schemas/22/M22_329_1.gz",
);
const BUNDLED = "M22 v329.1";
const CUSTOM = "M22 v329.1 (Custom)";
// Button indexes in the page's confirm boxes
const CONFIRM = 0;

test.beforeEach(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

function customSchemaPath() {
  return path.join(electron.userDataDir, "schemas", "M22_329_1.gz");
}

function copyBundledToCustom() {
  fs.mkdirSync(path.dirname(customSchemaPath()), { recursive: true });
  fs.copyFileSync(BUNDLED_M22, customSchemaPath());
}

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
    viewer: new SchemaViewer(window),
  };
}

async function openSchemas(nav, schemas) {
  await nav.openTab("Schemas");
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
}

async function waitForFiltered(viewer, message) {
  return viewer.waitForCount(
    ({ shown, total }) => shown < total && shown > 0,
    message,
  );
}

async function waitForUnfiltered(viewer) {
  return viewer.waitForCount(
    ({ shown, total }) => shown === total,
    "The filters never cleared",
  );
}

test("views, filters and sorts a schema without a file (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, nav, schemas, viewer } = await launch();

  // 1. No file: no link, but the eyes work
  await openSchemas(nav, schemas);
  expect(await schemas.hasViewLoadedLink()).to.equal(false);
  expect(await viewer.isOpen()).to.equal(false);

  await schemas.viewSchema(BUNDLED);
  await viewer.waitForOpen();
  expect(await viewer.header()).to.equal(`${BUNDLED} Schema Viewer`);
  expect(await schemas.isViewingRow(BUNDLED)).to.equal(true);
  const { total } = await viewer.count();
  expect(total).to.be.greaterThan(0);

  // 2. Field, then Table, then Type: each narrows, and every row matches
  await viewer.setFilter("field", "rating");
  const byField = await waitForFiltered(viewer, "The Field filter never applied");
  await viewer.setFilter("table", "player");
  const byTable = await viewer.waitForCount(
    ({ shown }) => shown < byField.shown && shown > 0,
    "The Table filter never applied",
  );
  await viewer.setFilter("type", "int");
  await viewer.waitForCount(
    ({ shown }) => shown <= byTable.shown && shown > 0,
    "The Type filter never applied",
  );
  for (const row of await viewer.rows()) {
    expect(row.field.toLowerCase()).to.include("rating");
    expect(row.table.toLowerCase()).to.include("player");
    expect(row.type.toLowerCase()).to.include("int");
  }
  expect(
    (await viewer.rows()).some((row) => row.field === "AccelerationRating"),
  ).to.equal(true);

  // A quoted Table filter matches exactly
  await viewer.clearFilters();
  await waitForUnfiltered(viewer);
  await viewer.setFilter("table", '"Player"');
  await waitForFiltered(viewer, "The exact Table filter never applied");
  const playerRows = await viewer.rows();
  expect(playerRows.length).to.be.greaterThan(0);
  expect(playerRows.every((row) => row.table === "Player")).to.equal(true);
  await viewer.clearFilters();
  await waitForUnfiltered(viewer);
  expect(await viewer.filterValue("table")).to.equal("");

  // 3. A Table cell filters by its table
  const [first] = await viewer.rows();
  await viewer.clickTable(0);
  expect(await viewer.filterValue("table")).to.equal(`"${first.table}"`);
  await waitForFiltered(viewer, "The Table click never filtered");
  expect(
    (await viewer.rows()).every((row) => row.table === first.table),
  ).to.equal(true);

  // A reference Type jumps to its table
  await viewer.setFilter("table", '"Team"');
  await poll(
    () => viewer.root.locator('[data-action="jump-type"]').count(),
    (count) => count > 0,
    { message: "Team has no reference types listed" },
  );
  const refType = await viewer.root
    .locator('[data-action="jump-type"]')
    .first()
    .innerText();
  await viewer.clickType(0);
  const target = refType.replace(/\[\]$/, "");
  expect(await viewer.filterValue("table")).to.equal(`"${target}"`);
  await poll(
    () => viewer.rows(),
    (rows) => rows.length > 0 && rows.every((row) => row.table === target),
    { message: `The jump never listed ${target}` },
  );
  await viewer.clearFilters();
  await waitForUnfiltered(viewer);

  // 4. Field sorts asc, desc, then back to the default
  const defaultFirst = (await viewer.rows())[0];
  await viewer.sortBy("name");
  const asc = await poll(
    () => viewer.rows(),
    (rows) => rows[0].field !== defaultFirst.field,
    { message: "Sorting by Field never changed the first row" },
  );
  const ascFields = asc.map((row) => row.field);
  await viewer.sortBy("name");
  const desc = await poll(
    () => viewer.rows(),
    (rows) => rows[0].field !== asc[0].field,
    { message: "The descending sort never applied" },
  );
  expect(desc[0].field.localeCompare(ascFields[0])).to.be.greaterThan(0);
  await viewer.sortBy("name");
  await poll(
    () => viewer.rows(),
    (rows) =>
      rows[0].field === defaultFirst.field &&
      rows[0].table === defaultFirst.table,
    { message: "The third click never restored the default order" },
  );

  // 5. Another schema keeps the filters
  copyBundledToCustom();
  await schemas.refresh();
  await poll(
    () => schemas.hasRow(CUSTOM),
    (has) => has,
    { message: "The custom copy never showed" },
  );
  await viewer.setFilter("field", "rating");
  await waitForFiltered(viewer, "The Field filter never applied");
  await schemas.viewSchema(CUSTOM);
  await viewer.waitForHeader(`${CUSTOM} Schema Viewer`);
  expect(await viewer.filterValue("field")).to.equal("rating");
  expect(await schemas.isViewingRow(CUSTOM)).to.equal(true);
  expect(await schemas.isViewingRow(BUNDLED)).to.equal(false);
  await waitForFiltered(viewer, "The filter didn't apply to the new schema");

  // 7. Close and reopen: the filters are empty
  await viewer.close();
  expect(await schemas.isViewingRow(CUSTOM)).to.equal(false);
  await schemas.viewSchema(CUSTOM);
  await viewer.waitForOpen();
  expect(await viewer.filterValue("field")).to.equal("");

  // Leaving the tab closes the pane
  await nav.openTab("Home");
  await nav.waitForActiveTab("Home");
  await openSchemas(nav, schemas);
  expect(await viewer.isOpen()).to.equal(false);

  // 8. Deleting the viewed schema closes the pane
  await schemas.viewSchema(CUSTOM);
  await viewer.waitForOpen();
  await stubMessageBox(electronApp, CONFIRM);
  await schemas.deleteSchema(CUSTOM);
  await viewer.waitForClosed();
  expect(fs.existsSync(customSchemaPath())).to.equal(false);

  await electronApp.close();
});

test("views the loaded schema and stays on it after a load (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, viewer } = await launch();
  copyBundledToCustom();

  // 6. The custom copy wins the tie at open
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
  await openSchemas(nav, schemas);
  expect(await schemas.hasViewLoadedLink()).to.equal(true);
  const loaded = await schemas.loadedLabel();
  expect(loaded).to.equal(CUSTOM);

  await schemas.viewLoaded();
  await viewer.waitForOpen();
  expect(await viewer.header()).to.equal(`${loaded} Schema Viewer`);
  expect(await schemas.isViewingRow(CUSTOM)).to.equal(true);

  // Loading the bundled one leaves the pane on the custom copy
  await stubMessageBox(electronApp, CONFIRM);
  await schemas.clickSchema(BUNDLED);
  await schemas.waitForLoaded(BUNDLED);
  expect(await viewer.isOpen()).to.equal(true);
  expect(await viewer.header()).to.equal(`${CUSTOM} Schema Viewer`);
  expect(await schemas.isViewingRow(CUSTOM)).to.equal(true);
  expect(await schemas.isLoadedRow(CUSTOM)).to.equal(false);

  await electronApp.close();
});
