const path = require("path");
const fs = require("fs/promises");
const { expect } = require("chai");
const { test, expect: playwrightExpect } = require("../util/test");

const electron = require("../util/Electron");
const FilePaths = require("../util/FilePaths");
const TestUtil = require("../util/TestUtil");

const App = require("../models/App");
const WelcomePage = require("../models/WelcomePage");
const TableEditorPage = require("../models/TableEditorPage");
const ReferenceEditorModal = require("../models/ReferenceEditorModal");

test.beforeAll(TestUtil.overwriteTestCareer);
test.afterAll(TestUtil.overwriteTestCareer);

test("pins e2e test", async () => {
  const electronApp = await electron.launchWithDefaultOptions();
  const app = new App(electronApp);

  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);

  await welcome.waitForPageLoad();

  // can open the table editor
  await welcome.openFranchiseFile(FilePaths.m22.career.test);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor._waitForTableToLoad();

  // pins are displayed correctly
  const pins = await tableEditor.getAllPins();

  // can add a pin
  await tableEditor.openTableById(4097);
  await tableEditor.addSelectedTableAsPin();
  const newPins = await tableEditor.getAllPins();
  expect(newPins.length).to.equal(pins.length + 1);

  // can click on a pin to load the table
  await tableEditor.clickPinByTableId(4097);
  const tableName = await tableEditor.getSelectedTableName();
  expect(tableName).to.equal("4097 - OverallPercentage");

  // can remove a pin
  await tableEditor.removePinByTableId(4097);
  const evenNewerPins = await tableEditor.getAllPins();
  expect(evenNewerPins.length).to.equal(pins.length);
});

test("pins are matched by uniqueId and legacy pins are migrated", async () => {
  const PLAYER_UNIQUE_ID = 1612938518;
  const OVERALL_PERCENTAGE_UNIQUE_ID = 4079666669;

  const electronApp = await electron.launchWithDefaultOptions({
    pins: [
      {
        gameYear: 22,
        pins: [
          // legacy pin from before uniqueIds were stored
          { tableId: 4097, tableName: "OverallPercentage" },
          // tableId is out of date (as after a game update)
          { uniqueId: PLAYER_UNIQUE_ID, tableId: 9999, tableName: "Player" },
        ],
      },
    ],
  });
  const pinsFile = path.join(electron.userDataDir, "pins.json");
  const app = new App(electronApp);
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(FilePaths.m22.career.test);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor._waitForTableToLoad();

  // the uniqueId pin opens the right table despite its stale tableId
  await tableEditor.clickPinByTableId(4220);
  expect(await tableEditor.getSelectedTableName()).to.equal("4220 - Player");

  // pins.json was upgraded in place
  await playwrightExpect
    .poll(async () => JSON.parse(await fs.readFile(pinsFile, "utf-8")))
    .toEqual([
      {
        gameYear: 22,
        gameType: "madden",
        pins: [
          {
            tableId: 4097,
            tableName: "OverallPercentage",
            uniqueId: OVERALL_PERCENTAGE_UNIQUE_ID,
          },
          { uniqueId: PLAYER_UNIQUE_ID, tableId: 4220, tableName: "Player" },
        ],
      },
    ]);

  await electronApp.close();
});
