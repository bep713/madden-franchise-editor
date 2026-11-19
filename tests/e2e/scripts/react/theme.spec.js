const fs = require("fs/promises");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const SettingsManager = require("../../models/SettingsManager");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

const DARK_SURFACE = "rgb(30, 30, 30)";
const LIGHT_SURFACE = "rgb(255, 255, 255)";
// .settings-manager background in the v4 stylesheet
const LEGACY_SETTINGS_BACKGROUND = "rgb(233, 233, 233)";

const nativeThemeState = (electronApp) =>
  electronApp.evaluate(({ nativeTheme }) => [
    nativeTheme.themeSource,
    nativeTheme.shouldUseDarkColors,
  ]);

// Playwright pins prefers-color-scheme to light; let the window follow
// nativeTheme like it does outside tests.
async function followNativeTheme(window) {
  await window.emulateMedia({ colorScheme: "no-override" });
  return window;
}

const background = (window, selector = "body") =>
  window.evaluate(
    (selector) => getComputedStyle(document.querySelector(selector)).backgroundColor,
    selector,
  );

const waitForBackground = (window, expected, selector) =>
  poll(
    () => background(window, selector),
    (value) => value === expected,
    { message: `${selector ?? "body"} background is ${expected}` },
  );

async function openSettings(app) {
  await app._clickMenuItem("ShowPreferences");
  const settingsManager = new SettingsManager(await app.getSettingsManager());
  await settingsManager.locators.uiVersionSelect.waitFor();
  await followNativeTheme(settingsManager.window);
  return settingsManager;
}

async function waitForWindow(electronApp, urlPart) {
  const find = () => electronApp.windows().find((w) => w.url().includes(urlPart));
  const window = await poll(find, Boolean, { message: `${urlPart} window opens` });
  await window.waitForLoadState("domcontentloaded");
  return followNativeTheme(window);
}

async function storedTheme() {
  const preferences = JSON.parse(
    await fs.readFile(path.join(electron.userDataDir, "preferences.json"), "utf8"),
  );
  return preferences.general.theme;
}

test("dark theme reaches the title bar, the main window and the shared windows", async () => {
  test.setTimeout(90 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: { general: { theme: "dark" } },
  });
  const app = new App(electronApp);
  const window = await followNativeTheme(await app.getMainWindow());
  await new WelcomePage(window).waitForPageLoad();

  expect(await nativeThemeState(electronApp)).to.deep.equal(["dark", true]);
  await waitForBackground(window, DARK_SURFACE);

  const settings = await openSettings(app);
  await waitForBackground(settings.window, DARK_SURFACE);
  await settings.locators.themeSelect.waitFor();

  await electronApp.evaluate(({ ipcMain }) => ipcMain.emit("show-schema-manager", {}));
  await waitForBackground(await waitForWindow(electronApp, "schema-manager"), DARK_SURFACE);

  await app._clickMenuItem("Credits");
  await waitForBackground(await waitForWindow(electronApp, "credits"), DARK_SURFACE, ".welcome");

  // Settings saves on Continue.
  await settings.setTheme("light");
  await settings.clickContinue();
  await poll(
    () => nativeThemeState(electronApp),
    ([source]) => source === "light",
    { message: "themeSource becomes light" },
  );
  await waitForBackground(window, LIGHT_SURFACE);
  await waitForBackground(settings.window, LEGACY_SETTINGS_BACKGROUND);
  expect(await storedTheme()).to.equal("light");

  await electronApp.close();
});

test("View -> Theme changes and saves the theme", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  const window = await followNativeTheme(await app.getMainWindow());
  await new WelcomePage(window).waitForPageLoad();

  expect(await app.isMenuItemVisible("ThemeMenu")).to.equal(true);
  expect(await app.isMenuItemChecked("ThemeSystem")).to.equal(true);

  await app.clickMenuItem("ThemeDark");
  expect(await nativeThemeState(electronApp)).to.deep.equal(["dark", true]);
  await waitForBackground(window, DARK_SURFACE);
  expect(await app.isMenuItemChecked("ThemeDark")).to.equal(true);
  expect(await storedTheme()).to.equal("dark");

  await app.clickMenuItem("ThemeLight");
  expect((await nativeThemeState(electronApp))[0]).to.equal("light");
  await waitForBackground(window, LIGHT_SURFACE);
  expect(await storedTheme()).to.equal("light");

  await electronApp.close();
});

test("the default theme follows Windows", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);
  await new WelcomePage(await app.getMainWindow()).waitForPageLoad();

  expect((await nativeThemeState(electronApp))[0]).to.equal("system");

  await electronApp.close();
});

test("the table grid is dark in the dark theme", async ({ sandbox }) => {
  test.setTimeout(90 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: { general: { theme: "dark" } },
  });
  const app = new App(electronApp);
  const window = await followNativeTheme(await app.getMainWindow());
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, sandbox.careerPath);
  await welcome.openTableEditor();
  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();

  const themed = await window.evaluate(
    () => document.querySelector(".ht-theme-main-dark-auto .ht_master td") !== null,
  );
  expect(themed).to.equal(true);
  const cell = await window.evaluate(() => {
    const td = document.querySelector(".ht_master tbody td");
    const [r, g, b] = getComputedStyle(td).backgroundColor.match(/\d+/g).map(Number);
    return r + g + b;
  });
  expect(cell, "cell background is dark").to.be.below(3 * 80);

  await electronApp.close();
});

test("v4 keeps the default theme and hides the setting", async () => {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "v4",
    preferences: { general: { theme: "dark" } },
  });
  const app = new App(electronApp);
  await app.getMainWindow();

  expect((await nativeThemeState(electronApp))[0]).to.equal("system");
  expect(await app.isMenuItemVisible("ThemeMenu")).to.equal(false);
  const settings = await openSettings(app);
  await waitForBackground(settings.window, LEGACY_SETTINGS_BACKGROUND);
  expect(await settings.locators.themeSelect.count()).to.equal(0);

  await electronApp.close();
});

test("switching to v4 drops the dark theme", async () => {
  test.setTimeout(90 * 1000);
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: { general: { theme: "dark" } },
  });
  const app = new App(electronApp);
  await new WelcomePage(await app.getMainWindow()).waitForPageLoad();
  const settings = await openSettings(app);
  await waitForBackground(settings.window, DARK_SURFACE);

  await settings.setUiVersion("v4");
  await settings.clickContinue();
  await poll(
    () => nativeThemeState(electronApp),
    ([source]) => source === "system",
    { message: "themeSource returns to system" },
  );
  await waitForBackground(settings.window, LEGACY_SETTINGS_BACKGROUND);

  await electronApp.close();
});
