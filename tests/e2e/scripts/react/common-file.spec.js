const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const CommonFileModal = require("../../models/react/CommonFileModal");

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

const getPreference = (window, keyPath) =>
  window.evaluate((k) => window.electronAPI.preferences.getValue(k), keyPath);

const getRememberedChoices = (window) =>
  window.evaluate(() => window.electronAPI.fs.readJson("commonFileChoices.json"));

const getActiveMetadata = (window) =>
  window.evaluate(async () =>
    window.franchiseAPI.getMetadata(await window.franchiseAPI.getActiveFileId()),
  );

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

  expect(await prompt.isRemembered()).to.equal(false);

  await prompt.choose("22", "madden");
  await prompt.setRemember(true);
  await prompt.confirm();
  await welcome.waitForOpenFile(FilePaths.m22.common);

  const metadata = await getActiveMetadata(window);
  expect(metadata.gameYear).to.equal(22);
  expect(metadata.type.gameType).to.equal("madden");
  expect(metadata.type.format).to.equal("franchise-common");

  // Remembered for this path; the general defaults are unchanged
  expect(await getRememberedChoices(window)).to.deep.equal({
    [FilePaths.m22.common]: { gameYear: 22, gameType: "madden" },
  });
  expect(await getPreference(window, "general.ftcGameYearOverride")).to.equal(
    "27",
  );
  expect(await getPreference(window, "general.ftcGameTypeOverride")).to.equal(
    "college",
  );

  // The schedule editor isn't available for common files
  expect(await nav.tabNames()).to.not.include("Schedule");

  await electronApp.close();
});

test("cancelling the common-file prompt keeps the open file (react)", async () => {
  const { electronApp, window, welcome } = await launch();
  const prompt = new CommonFileModal(window);

  await welcome.openFranchiseFile(electronApp, careerPath);

  await welcome.startOpenFile(electronApp, FilePaths.m22.common);
  await prompt.waitForOpen();
  await prompt.cancel();

  expect(await welcome.getStartedTitle()).to.equal(
    path.basename(careerPath),
  );
  // Nothing was remembered
  expect(await getRememberedChoices(window)).to.equal(null);

  await electronApp.close();
});

test("re-opens a remembered common file without asking (react)", async () => {
  const { electronApp, window, welcome } = await launch();
  const prompt = new CommonFileModal(window);

  await welcome.startOpenFile(electronApp, FilePaths.m22.common);
  await prompt.waitForOpen();
  await prompt.choose("22", "madden");
  await prompt.setRemember(true);
  await prompt.confirm();
  await welcome.waitForOpenFile(FilePaths.m22.common);

  // Open a career file, then the common file again: no prompt this time
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openFranchiseFile(electronApp, FilePaths.m22.common);
  expect(await prompt.dialog.isVisible()).to.equal(false);
  expect((await getActiveMetadata(window)).gameYear).to.equal(22);

  // Change: prefilled with the remembered choice, then re-opens the file
  // with the new one, without a message box
  expect(await welcome.locators.getStartedCard.innerText()).to.contain(
    "Madden NFL 22",
  );
  await welcome.changeFileParameters();
  await prompt.waitForOpen();
  expect(await prompt.getGameYear()).to.equal("22");
  expect(await prompt.isRemembered()).to.equal(true);
  await prompt.choose("23", "madden");
  await prompt.confirm();

  await poll(
    async () => (await getActiveMetadata(window))?.gameYear,
    (year) => year === 23,
    { message: "the common file was never re-opened as M23" },
  );
  expect(await getRememberedChoices(window)).to.deep.equal({
    [FilePaths.m22.common]: { gameYear: 23, gameType: "madden" },
  });
  await poll(
    () => welcome.locators.getStartedCard.innerText(),
    (text) => text.includes("Madden NFL 23"),
    { message: "the Get Started card never showed Madden NFL 23" },
  );

  await electronApp.close();
});
