const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const {
  stubOpenDialog,
  openDialogCalls,
  stubMessageBox,
  messageBoxCalls,
} = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");

let electronApp;

test.afterEach(async () => {
  await electronApp?.close();
  electronApp = null;
});

async function launch(options = {}) {
  electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    ...options,
  });
  const window = await new App(electronApp).getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  return { window, welcome };
}

test("a missing recent file is removed", async ({ sandbox }) => {
  const copyName = "CAREER-M22COPY";
  const copyPath = path.join(sandbox.dir, copyName);
  fs.copyFileSync(sandbox.careerPath, copyPath);

  const { window, welcome } = await launch();
  // Opening the copy puts it in recents
  await welcome.openFranchiseFile(electronApp, copyPath);
  await welcome.openFranchiseFile(electronApp, sandbox.careerPath);
  const activeFileId = await window.evaluate(() =>
    window.franchiseAPI.getActiveFileId(),
  );
  await welcome.recentFile(copyName).waitFor();

  fs.unlinkSync(copyPath);
  await stubMessageBox(electronApp, 0);
  await welcome.recentFile(copyName).click();

  await poll(
    () => messageBoxCalls(electronApp),
    (calls) => calls.some((call) => call.title === "File not found"),
    { message: "File not found box never showed" },
  );
  await poll(
    () => welcome.recentFile(copyName).count(),
    (count) => count === 0,
    { message: `${copyName} stayed in Recent Files` },
  );
  // The original is still open
  expect(
    await window.evaluate(() => window.franchiseAPI.getActiveFileId()),
  ).to.equal(activeFileId);
  expect(await welcome.getStartedTitle()).to.equal(
    path.basename(sandbox.careerPath),
  );
});

test("the Open dialog starts in the default directory", async ({
  sandbox,
}) => {
  const { welcome } = await launch({
    preferences: { general: { defaultDirectory: sandbox.dir } },
  });
  await stubOpenDialog(electronApp, sandbox.careerPath);
  await welcome.locators.sideNavOpenFileLink.click();
  await welcome.waitForOpenFile(sandbox.careerPath);

  const calls = await openDialogCalls(electronApp);
  expect(calls).to.have.lengthOf(1);
  expect(calls[0].defaultPath).to.equal(sandbox.dir);
});
