const { expect } = require("chai");
const { test } = require("@playwright/test");

const electron = require("../util/Electron");
const TestUtil = require("../util/TestUtil");

const App = require("../models/App");
const SettingsManager = require("../models/SettingsManager");

test("release notes continue button advances to settings", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);
  await app.getMainWindow();

  await app._clickMenuItem("ViewReleaseNotes");
  await TestUtil.wait(500);

  const settingsManagerWindow = await app.getSettingsManager();
  const settingsManager = new SettingsManager(settingsManagerWindow);
  await settingsManagerWindow.locator(".version").waitFor();

  await settingsManager.clickContinue();

  // the general settings page should now be shown
  await settingsManager.locators.autoSaveCheckbox.waitFor();
  expect(await settingsManager.locators.autoSaveCheckbox.isVisible()).to.eql(true);

  // previous goes back to release notes
  await settingsManager.clickPrevious();
  await settingsManagerWindow.locator(".version").waitFor();

  await electronApp.close();
});
