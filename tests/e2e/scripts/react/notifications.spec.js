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
const NotificationDrawer = require("../../models/react/NotificationDrawer");
const CommonFileModal = require("../../models/react/CommonFileModal");
const LegacyWelcomePage = require("../../models/WelcomePage");

const BUNDLED_M22 = path.join(
  __dirname,
  "../../../../node_modules/madden-franchise/data/schemas/22/M22_329_1.gz",
);
const BUNDLED = "M22 v329.1";
const CUSTOM = "M22 v329.1 (Custom)";
// The test career expects v328.1, and only v329.1 is bundled
const MISMATCH = "Loaded M22 v329.1, expected M22 v328.1.";
const CONFIRM = 0;

test.beforeEach(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

function copyBundledTo(name) {
  const target = path.join(electron.userDataDir, "schemas", name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(BUNDLED_M22, target);
  return target;
}

async function launch() {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  return {
    electronApp,
    window,
    welcome,
    nav: new NavigationBar(window),
    schemas: new SchemaManagementPage(window),
    drawer: new NotificationDrawer(window),
  };
}

async function openCareer(electronApp, welcome) {
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);
}

async function openSchemas(nav, schemas) {
  await nav.openTab("Schemas");
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
}

async function backHome(nav, welcome) {
  await nav.openTab("Home");
  await nav.waitForActiveTab("Home");
  await welcome.waitForPageLoad();
}

// Opens the drawer and returns its single schema-mismatch item
async function mismatchItem(drawer) {
  await drawer.open();
  await drawer.waitForItemCount(1);
  const [item] = await drawer.items();
  expect(item.kind).to.equal("schema-mismatch");
  return item;
}

test("lists a schema mismatch and marks it read (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, drawer } = await launch();

  await drawer.open();
  expect(await drawer.isEmpty()).to.equal(true);
  await drawer.close();
  expect(await drawer.isOpen()).to.equal(false);

  await openCareer(electronApp, welcome);
  await drawer.waitForBadgeCount(1);

  const item = await mismatchItem(drawer);
  expect(item).to.include({
    title: "Schema Mismatch",
    description: MISMATCH,
    linkLabel: "Open Schema Management",
    time: "Just now",
    read: false,
  });
  // Marked read in main at once, so the badge goes
  await drawer.waitForBadgeCount(0);

  await drawer.close();
  await drawer.open();
  const [reopened] = await drawer.items();
  expect(reopened.id).to.equal(item.id);
  expect(reopened.read).to.equal(true);
  expect(await drawer.badgeCount()).to.equal(0);

  await electronApp.close();
});

test("the link selects the Schemas tab (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, drawer } = await launch();

  await openCareer(electronApp, welcome);
  const item = await mismatchItem(drawer);
  await drawer.clickLink(item.id);
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();

  await electronApp.close();
});

test("loading the expected schema removes the notification (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, drawer } = await launch();

  await openCareer(electronApp, welcome);
  await mismatchItem(drawer);

  copyBundledTo("M22_328_1.gz");
  await openSchemas(nav, schemas);
  await schemas.refresh();
  await poll(
    () => schemas.hasExpectedLink(),
    (has) => has,
    { message: "The Expected link never showed" },
  );
  await stubMessageBox(electronApp, CONFIRM);
  await schemas.clickExpected();
  await schemas.waitForLoaded("M22 v328.1");

  await backHome(nav, welcome);
  await drawer.open();
  await drawer.waitForItemCount(0);
  expect(await drawer.isEmpty()).to.equal(true);

  await electronApp.close();
});

test("loading a mismatched schema by hand removes the notification (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, drawer } = await launch();
  copyBundledTo("M22_329_1.gz");

  // The custom copy wins the tie at open, so loading the bundled one is a
  // real switch, still to a schema that doesn't match
  await openCareer(electronApp, welcome);
  await mismatchItem(drawer);
  await openSchemas(nav, schemas);
  expect(await schemas.isLoadedRow(CUSTOM)).to.equal(true);
  await stubMessageBox(electronApp, CONFIRM);
  await schemas.clickSchema(BUNDLED);
  await schemas.waitForLoaded(BUNDLED);
  expect(await schemas.status()).to.equal("mismatch");

  await backHome(nav, welcome);
  await drawer.open();
  await drawer.waitForItemCount(0);
  expect(await drawer.isEmpty()).to.equal(true);

  await electronApp.close();
});

test("a dismissed notification stays gone (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, drawer } = await launch();

  await openCareer(electronApp, welcome);
  const item = await mismatchItem(drawer);
  await drawer.dismiss(item.id);
  await drawer.waitForItemCount(0);
  expect(await drawer.isEmpty()).to.equal(true);

  await openSchemas(nav, schemas);
  await backHome(nav, welcome);
  await drawer.open();
  expect(await drawer.locators.items.count()).to.equal(0);
  expect(await drawer.badgeCount()).to.equal(0);

  await electronApp.close();
});

test("opening another file removes the notification (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, drawer } = await launch();
  const prompt = new CommonFileModal(window);

  await openCareer(electronApp, welcome);
  const item = await mismatchItem(drawer);

  await welcome.startOpenFile(electronApp, FilePaths.m22.common);
  await prompt.waitForOpen();
  await prompt.confirm();
  await welcome.waitForOpenFile(FilePaths.m22.common);

  await poll(
    () => drawer.item(item.id).count(),
    (count) => count === 0,
    { message: "The career's notification is still listed" },
  );

  await electronApp.close();
});

test("the notification survives a UI switch (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, drawer } = await launch();

  await openCareer(electronApp, welcome);
  await drawer.waitForBadgeCount(1);

  await welcome.switchToLegacy();
  const legacyWelcome = new LegacyWelcomePage(window);
  await legacyWelcome.waitForOpenFile();
  await legacyWelcome.switchToNew();
  await welcome.waitForOpenFile(FilePaths.m22.career.test);

  // Still unread, since the drawer was never opened
  await drawer.waitForBadgeCount(1);
  const item = await mismatchItem(drawer);
  expect(item.description).to.equal(MISMATCH);
  expect(item.read).to.equal(false);

  await electronApp.close();
});
