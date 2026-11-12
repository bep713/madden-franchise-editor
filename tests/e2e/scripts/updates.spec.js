const { expect } = require("chai");
const { test } = require("../util/test");

const electron = require("../util/Electron");
const { setNextUpdate, updaterCounts } = require("../util/updaterStubs");
const { poll } = require("../util/poll");

const App = require("../models/App");
const WelcomePage = require("../models/WelcomePage");

test("a manual check offers the update and installs it", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  await new WelcomePage(window).waitForPageLoad();

  await setNextUpdate(electronApp, { version: "99.0.0" });
  await app.clickMenuItem("CheckForUpdate");

  const bar = window.locator(".update-wrapper:not(.notification-wrapper--hidden)");
  await bar.waitFor();
  const current = await electronApp.evaluate(({ app }) => app.getVersion());
  expect(await bar.locator(".update-ready-text").innerText()).to.equal(
    `Version 99.0.0 is available (you have ${current}). It will take less than 5 minutes to install.`,
  );

  await bar.locator(".update-action").click();
  await poll(
    () => updaterCounts(electronApp),
    (counts) => counts.installs === 1,
    { message: "The update was never installed" },
  );

  await electronApp.close();
});
