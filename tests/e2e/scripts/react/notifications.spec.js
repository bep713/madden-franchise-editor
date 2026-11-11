const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const {
  stubMessageBox,
  messageBoxCalls,
} = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const SchemaManagementPage = require("../../models/react/SchemaManagementPage");
const NotificationDrawer = require("../../models/react/NotificationDrawer");
const CommonFileModal = require("../../models/react/CommonFileModal");
const Banner = require("../../models/react/Banner");
const LegacyWelcomePage = require("../../models/WelcomePage");

const BUNDLED_M22 = path.join(
  __dirname,
  "../../../../node_modules/madden-franchise/data/schemas/22/M22_329_1.gz",
);
const BUNDLED = "M22 v329.1";
const CUSTOM = "M22 v329.1 (Custom)";
// The test career expects v328.1, and only v329.1 is bundled
const MISMATCH = "Loaded M22 v329.1, expected M22 v328.1.";
const BANNER_MESSAGE =
  "We cannot find an exact match for this file's schema. Open the schema management page?";
const CONFIRM = 0;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

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
    banner: new Banner(window),
  };
}

async function openCareer(electronApp, welcome, options) {
  await welcome.openFranchiseFile(
    electronApp,
    careerPath,
    options,
  );
}

// The store in main, read without opening the drawer (which marks all read)
async function storedNotifications(window) {
  return window.evaluate(() => window.electronAPI.notifications.list());
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  await welcome.waitForOpenFile(careerPath);

  // Still unread, since the drawer was never opened
  await drawer.waitForBadgeCount(1);
  const item = await mismatchItem(drawer);
  expect(item.description).to.equal(MISMATCH);
  expect(item.read).to.equal(false);

  await electronApp.close();
});

test("opening a mismatched file shows the banner (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, drawer, banner } = await launch();

  await openCareer(electronApp, welcome, { keepBanners: true });
  await banner.waitForBanner("schema-mismatch");
  expect(await banner.message()).to.equal(BANNER_MESSAGE);

  // Already listed while the banner is up
  const item = await mismatchItem(drawer);
  expect(item.description).to.equal(MISMATCH);
  expect(await banner.isVisible()).to.equal(true);

  await electronApp.close();
});

test("the banner's Yes opens Schemas and marks it read (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, nav, schemas, drawer, banner } =
    await launch();

  await openCareer(electronApp, welcome, { keepBanners: true });
  await banner.waitForBanner("schema-mismatch");
  await banner.click("Yes");
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
  await banner.waitForHidden();

  const [stored] = await storedNotifications(window);
  expect(stored.read).to.equal(true);
  await backHome(nav, welcome);
  await drawer.waitForBadgeCount(0);

  await electronApp.close();
});

test("the banner hides on its own and the notification stays (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, drawer, banner } = await launch();

  await openCareer(electronApp, welcome, { keepBanners: true });
  await banner.waitForBanner("schema-mismatch");
  await banner.waitForHidden({ timeout: 12 * 1000 });

  const stored = await storedNotifications(window);
  expect(stored).to.have.length(1);
  expect(stored[0].read).to.equal(false);
  await drawer.waitForBadgeCount(1);

  await electronApp.close();
});

test("hovering keeps the banner up (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, banner } = await launch();

  await openCareer(electronApp, welcome, { keepBanners: true });
  await banner.waitForBanner("schema-mismatch");
  await banner.hover();
  await wait(9 * 1000);
  expect(await banner.isVisible()).to.equal(true);

  await electronApp.close();
});

test("loading a mismatched schema by hand shows no banner (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, banner } = await launch();
  copyBundledTo("M22_329_1.gz");

  // Closes the open's banner
  await openCareer(electronApp, welcome);
  expect(await banner.isVisible()).to.equal(false);
  await openSchemas(nav, schemas);
  await stubMessageBox(electronApp, CONFIRM);
  await schemas.clickSchema(BUNDLED);
  await schemas.waitForLoaded(BUNDLED);
  expect(await schemas.status()).to.equal("mismatch");

  await wait(1000);
  expect(await banner.isVisible()).to.equal(false);

  await electronApp.close();
});

// The FTC fixture remembered as M18, which has no schema (bundled covers
// 19-27), so its open fails with schema-not-found
function rememberFtcAsM18() {
  fs.writeFileSync(
    path.join(electron.userDataDir, "commonFileChoices.json"),
    JSON.stringify({
      [FilePaths.m22.common]: { gameYear: 18, gameType: "madden" },
    }),
  );
}

const MISSING_BANNER =
  "No schema was found for FTC-E2ETEST. Choose one on the Schema Management page?";
const MISSING =
  "FTC-E2ETEST could not be opened because no schema exists for M18.";

// Opens the FTC fixture, which fails for lack of a schema. Answers any
// message box, so one that shows is recorded instead of blocking.
async function openMissing(electronApp, welcome, banner) {
  rememberFtcAsM18();
  await stubMessageBox(electronApp, CONFIRM);
  await welcome.startOpenFile(electronApp, FilePaths.m22.common);
  await banner.waitForBanner("schema-missing");
}

const normalize = (p) => p.replace(/\\/g, "/").toLowerCase();

test("a missing schema shows a banner instead of an error (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, drawer, banner } = await launch();

  await openMissing(electronApp, welcome, banner);
  expect(await banner.message()).to.equal(MISSING_BANNER);
  expect(await messageBoxCalls(electronApp)).to.deep.equal([]);

  await drawer.open();
  await drawer.waitForItemCount(1);
  const [item] = await drawer.items();
  expect(item).to.include({
    kind: "schema-missing",
    title: "Schema Missing",
    description: MISSING,
    linkLabel: "Choose a schema",
  });

  await electronApp.close();
});

test("picking a schema for the missing file opens it (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, window, welcome, nav, schemas, banner } =
    await launch();

  await openMissing(electronApp, welcome, banner);
  await banner.click("Yes");
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
  await schemas.waitForPendingCard();
  expect(await schemas.pendingText()).to.contain(
    "Choose a schema for FTC-E2ETEST",
  );
  expect(await schemas.pendingText()).to.contain("No schema exists for M18.");
  expect(await schemas.hasLoadedCard()).to.equal(false);

  await schemas.clickSchema(BUNDLED);
  await schemas.waitForPendingCardHidden();
  const metadata = await poll(
    () =>
      window.evaluate(async () => {
        const fileId = await window.franchiseAPI.getActiveFileId();
        return fileId ? window.franchiseAPI.getMetadata(fileId) : null;
      }),
    (m) => !!m,
    { message: "The FTC never opened" },
  );
  expect(normalize(metadata.schemaList.path)).to.equal(
    normalize(path.resolve(BUNDLED_M22)),
  );
  // The missing notification is gone, and a schemaOverride never notifies
  await poll(
    () => storedNotifications(window),
    (list) => list.length === 0,
    { message: "Notifications were left after the open" },
  );
  expect(await messageBoxCalls(electronApp)).to.deep.equal([]);

  await electronApp.close();
});

test("the drawer link sets the pending file and Cancel clears it (react)", async () => {
  test.setTimeout(120 * 1000);
  const { electronApp, welcome, nav, schemas, drawer, banner } =
    await launch();

  await openMissing(electronApp, welcome, banner);
  await banner.waitForHidden({ timeout: 12 * 1000 });

  await drawer.open();
  await drawer.waitForItemCount(1);
  const [item] = await drawer.items();
  await drawer.clickLink(item.id);
  await nav.waitForActiveTab("Schemas");
  await schemas.waitForPageLoad();
  await schemas.waitForPendingCard();
  expect(await schemas.isLink(BUNDLED)).to.equal(true);

  await schemas.cancelPending();
  await schemas.waitForPendingCardHidden();
  // No file is open, so names are plain again
  expect(await schemas.isLink(BUNDLED)).to.equal(false);

  await electronApp.close();
});

// A compressed FTC whose expectedSchemaVersion is null gets no notification,
// so no banner (tests/unit/schemaMismatch.test.js covers the check). There is
// no such fixture: FTC-E2ETEST is zlib-compressed but still expects v328.1,
// so it gets a real mismatch.
test.skip("opening a compressed FTC with no expected schema shows no banner (react)", async () => {});
