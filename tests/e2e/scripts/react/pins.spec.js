const path = require("path");
const { isDeepStrictEqual } = require("util");
const fs = require("fs/promises");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { poll } = require("../../util/poll");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const TableEditorPage = require("../../models/react/TableEditorPage");

const PLAYER_UNIQUE_ID = 1612938518;
const OVERALL_PERCENTAGE_UNIQUE_ID = 4079666669;
// getInitialPins() for M22, sorted by table id. The defaults' League (4269)
// and Franchise (4688) ids are stale for this file, so they are matched by name.
const DEFAULT_PIN_IDS = [4220, 4272, 4712, 7388];

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
};

const m22PinIds = async (pinsFile) =>
  ((await readJson(pinsFile)) || [])
    .find((group) => group.gameYear === 22 && group.gameType === "madden")
    ?.pins.map((pin) => pin.tableId)
    .sort((a, b) => a - b);

const waitForSavedPinIds = (pinsFile, expected) =>
  poll(
    () => m22PinIds(pinsFile),
    (ids) => JSON.stringify(ids) === JSON.stringify(expected),
    { message: `pins.json never had ${JSON.stringify(expected)}` },
  );

async function openTableEditor(electronApp) {
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.waitForTableToLoad();
  return tableEditor;
}

test("pins e2e test (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({ ui: "react" });
  const pinsFile = path.join(electron.userDataDir, "pins.json");
  const prefsFile = path.join(electron.userDataDir, "preferences.json");
  const tableEditor = await openTableEditor(electronApp);

  // default pins show in the Pinned section, and are saved with uniqueIds
  await tableEditor.waitForPinnedTableIds(DEFAULT_PIN_IDS);
  await waitForSavedPinIds(pinsFile, DEFAULT_PIN_IDS);
  const player = (await readJson(pinsFile))
    .find((group) => group.gameYear === 22)
    .pins.find((pin) => pin.tableId === 4220);
  expect(player.uniqueId).to.equal(PLAYER_UNIQUE_ID);
  expect(await tableEditor.isCardPinned(4220, "pinned")).to.equal(true);

  // can pin from the action bar
  await tableEditor.openTableById(4097);
  expect(await tableEditor.getPinActionText()).to.equal("Pin");
  expect(await tableEditor.isCardPinned(4097)).to.equal(false);
  await tableEditor.togglePinSelectedTable();
  await poll(
    () => tableEditor.getPinActionText(),
    (text) => text === "Unpin",
  );
  // the pinned table moves from the full list to the Pinned section
  await tableEditor.sidebarCard(4097, "pinned").waitFor();
  expect(await tableEditor.sidebarCard(4097, "all").count()).to.equal(0);
  expect(await tableEditor.isCardPinned(4097, "pinned")).to.equal(true);
  await waitForSavedPinIds(pinsFile, [4097, ...DEFAULT_PIN_IDS]);
  const overall = (await readJson(pinsFile))
    .find((group) => group.gameYear === 22)
    .pins.find((pin) => pin.tableId === 4097);
  expect(overall).to.deep.equal({
    tableId: 4097,
    tableName: "OverallPercentage",
    uniqueId: OVERALL_PERCENTAGE_UNIQUE_ID,
  });

  // and unpin from the action bar, which moves it back to the full list
  await tableEditor.togglePinSelectedTable();
  await poll(
    () => tableEditor.getPinActionText(),
    (text) => text === "Pin",
  );
  await waitForSavedPinIds(pinsFile, DEFAULT_PIN_IDS);
  await tableEditor.sidebarCard(4097, "all").waitFor();

  // can pin with the hover button in the full list, and unpin it from the
  // Pinned section it moves to
  await tableEditor.pinFromSidebar(4097, "all");
  await waitForSavedPinIds(pinsFile, [4097, ...DEFAULT_PIN_IDS]);
  expect(await tableEditor.isCardPinned(4097, "pinned")).to.equal(true);
  await tableEditor.unpinFromSidebar(4097, "pinned");
  await waitForSavedPinIds(pinsFile, DEFAULT_PIN_IDS);
  // the button doesn't select the table (4097 was already selected)
  expect(await tableEditor.getSelectedTableName()).to.equal(
    "4097 - OverallPercentage",
  );

  // and in the Pinned section, which doesn't select the table either
  await tableEditor.searchTables("");
  await tableEditor.waitForPinnedTableIds(DEFAULT_PIN_IDS);
  await tableEditor.unpinFromSidebar(4712, "pinned");
  await tableEditor.waitForPinnedTableIds([4220, 4272, 7388]);
  await waitForSavedPinIds(pinsFile, [4220, 4272, 7388]);
  expect(await tableEditor.getSelectedTableName()).to.equal(
    "4097 - OverallPercentage",
  );

  // a pin can open its table
  await tableEditor.sidebarCard(4220, "pinned").click();
  await poll(
    () => tableEditor.getSelectedTableName(),
    (name) => name === "4220 - Player",
  );

  // hiding the Pinned section is saved as a preference
  expect(await tableEditor.isPinnedSectionToggleOn()).to.equal(true);
  await tableEditor.togglePinnedSection();
  await tableEditor.waitForPinnedTableIds([]);
  await poll(
    async () => (await readJson(prefsFile))?.general?.showPinnedTables,
    (value) => Array.isArray(value) && value.length === 0,
    { message: "showPinnedTables was never saved as false" },
  );
  // with the section hidden, pinned tables are back in the full list. It is
  // virtualized, so search to bring the card into view
  await tableEditor.searchTables("4220");
  await tableEditor.sidebarCard(4220, "all").waitFor();
  expect(await tableEditor.isCardPinned(4220)).to.equal(true);

  await electronApp.close();
});

test("pins are matched by uniqueId and legacy pins are migrated (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
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
  const tableEditor = await openTableEditor(electronApp);

  // the uniqueId pin opens the right table despite its stale tableId
  await tableEditor.waitForPinnedTableIds([4097, 4220]);
  await tableEditor.sidebarCard(4220, "pinned").click();
  await poll(
    () => tableEditor.getSelectedTableName(),
    (name) => name === "4220 - Player",
  );

  // pins.json was upgraded in place
  const expected = [
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
  ];
  await poll(
    () => readJson(pinsFile),
    (pins) => isDeepStrictEqual(pins, expected),
    { message: "pins.json was never migrated" },
  );

  await electronApp.close();
});
