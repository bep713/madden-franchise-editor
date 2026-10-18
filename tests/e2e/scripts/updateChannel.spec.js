const { expect } = require("chai");
const { test } = require("../util/test");

const electron = require("../util/Electron");
const TestUtil = require("../util/TestUtil");

const App = require("../models/App");
const SettingsManager = require("../models/SettingsManager");

async function openSettings(app) {
  await app._clickMenuItem("ShowPreferences");
  await TestUtil.wait(500);

  const settingsManagerWindow = await app.getSettingsManager();
  const settingsManager = new SettingsManager(settingsManagerWindow);
  await settingsManager.locators.updateChannelSelect.waitFor();
  return settingsManager;
}

test("update channel setting e2e test", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);

  // Make sure the main window is ready before using the menu.
  await app.getMainWindow();

  // defaults to stable
  let settingsManager = await openSettings(app);
  expect(await settingsManager.getUpdateChannel()).to.eql("stable");

  // can switch to nightly. Preferences are saved on Continue.
  await settingsManager.setUpdateChannel("nightly");
  await settingsManager.clickContinue();
  await settingsManager.clickContinue();

  // the choice persists when settings are reopened
  settingsManager = await openSettings(app);
  expect(await settingsManager.getUpdateChannel()).to.eql("nightly");

  await electronApp.close();
});
