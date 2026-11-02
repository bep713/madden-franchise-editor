const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const FilePaths = require("../../util/FilePaths");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");

test("opens a College Football file (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);

  await welcome.waitForPageLoad();

  // Only opened, never saved, so the fixture isn't changed
  await welcome.openFranchiseFile(electronApp, FilePaths.c27.dynasty.test);
  const metadata = await window.evaluate(async () =>
    window.franchiseAPI.getMetadata(await window.franchiseAPI.getActiveFileId()),
  );
  expect(metadata.gameYear).to.equal(27);
  expect(metadata.type.gameType).to.equal("college");

  // the card shows the CFB 27 icon, not Madden 27's
  await welcome.gameIcon("CFB 27").waitFor();
  expect(await welcome.gameIcon("Madden 27").count()).to.equal(0);

  // the schedule editor is Madden only, as in v4
  expect(await nav.tabNames()).to.deep.equal([
    "Home",
    "Schemas",
    "Open Table...",
  ]);

  await electronApp.close();
});
