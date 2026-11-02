const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const TestUtil = require("../../util/TestUtil");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const CommonFileModal = require("../../models/react/CommonFileModal");

test.beforeAll(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

const getPreference = (window, keyPath) =>
  window.evaluate((k) => window.electronAPI.preferences.getValue(k), keyPath);

async function launch(preferences) {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences,
  });
  const window = await new App(electronApp).getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  return { electronApp, window, welcome };
}

test("asks for the year and type of a common file (react)", async () => {
  // Saved defaults that differ from the choice below
  const { electronApp, window, welcome } = await launch({
    general: { ftcGameYearOverride: "27", ftcGameTypeOverride: "college" },
  });
  const nav = new NavigationBar(window);
  const prompt = new CommonFileModal(window);

  await welcome.startOpenFile(electronApp, FilePaths.m22.common);
  await prompt.waitForOpen();
  expect(await prompt.getGameYear()).to.equal("27");
  expect(await prompt.getGameType()).to.equal("college");

  await prompt.choose("22", "madden");
  await prompt.setSaveAsDefault(true);
  await prompt.confirm();
  await welcome.waitForOpenFile(FilePaths.m22.common);

  const metadata = await window.evaluate(async () =>
    window.franchiseAPI.getMetadata(await window.franchiseAPI.getActiveFileId()),
  );
  expect(metadata.gameYear).to.equal(22);
  expect(metadata.type.gameType).to.equal("madden");
  expect(metadata.type.format).to.equal("franchise-common");

  // Saved as strings, like v4
  expect(await getPreference(window, "general.ftcGameYearOverride")).to.equal(
    "22",
  );
  expect(await getPreference(window, "general.ftcGameTypeOverride")).to.equal(
    "madden",
  );

  // The schedule editor isn't available for common files
  expect(await nav.tabNames()).to.not.include("Schedule");

  await electronApp.close();
});

test("cancelling the common-file prompt keeps the open file (react)", async () => {
  const { electronApp, window, welcome } = await launch();
  const prompt = new CommonFileModal(window);

  await welcome.openFranchiseFile(electronApp, FilePaths.m22.career.test);

  await welcome.startOpenFile(electronApp, FilePaths.m22.common);
  await prompt.waitForOpen();
  await prompt.cancel();

  expect(await welcome.getStartedTitle()).to.equal(
    path.basename(FilePaths.m22.career.test),
  );
  // The default box was never ticked
  expect(await getPreference(window, "general.ftcGameYearOverride")).to.equal(
    "22",
  );

  await electronApp.close();
});
