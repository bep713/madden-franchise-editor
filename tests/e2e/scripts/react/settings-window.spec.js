const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");

const App = require("../../models/App");
const SettingsManager = require("../../models/SettingsManager");
const WelcomePage = require("../../models/react/WelcomePage");

async function launchHome() {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const welcome = new WelcomePage(await app.getMainWindow());
  await welcome.waitForPageLoad();
  return { electronApp, app, welcome };
}

test("Release Notes in the side nav opens the release notes (react)", async () => {
  const { electronApp, app, welcome } = await launchHome();

  await welcome.locators.releaseNotesLink.click();
  const settingsWindow = await app.getSettingsManager();
  await settingsWindow.locator(".version").waitFor();

  const settingsManager = new SettingsManager(settingsWindow);
  await settingsManager.clickContinue();
  await settingsManager.locators.autoSaveCheckbox.waitFor();

  await electronApp.close();
});

test("Settings in the side nav saves the update channel (react)", async () => {
  const { electronApp, app, welcome } = await launchHome();

  await welcome.locators.settingsLink.click();
  let settingsManager = new SettingsManager(await app.getSettingsManager());
  await settingsManager.locators.updateChannelSelect.waitFor();
  expect(await settingsManager.getUpdateChannel()).to.equal("stable");

  await settingsManager.setUpdateChannel("nightly");
  await settingsManager.clickContinue();
  await settingsManager.clickContinue();

  await welcome.locators.settingsLink.click();
  settingsManager = new SettingsManager(await app.getSettingsManager());
  await settingsManager.locators.updateChannelSelect.waitFor();
  expect(await settingsManager.getUpdateChannel()).to.equal("nightly");

  await electronApp.close();
});
