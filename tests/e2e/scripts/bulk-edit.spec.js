const { test, expect } = require("../util/test");

const electron = require("../util/Electron");
const { readSavedTable } = require("../util/diskReader");

const App = require("../models/App");
const WelcomePage = require("../models/WelcomePage");
const TableEditorPage = require("../models/TableEditorPage");
const ScheduleEditorPage = require("../models/ScheduleEditorPage");

// The Player table is the largest table in the test file (3960 rows, ~1000 of them empty),
// which makes it the worst case for bulk edits.
const PLAYER_TABLE_ID = 4220;
const FIRST_EMPTY_PLAYER_ROWS = [373, 374, 375, 376];
const NEXT_EMPTY_PLAYER_ROW = 427;
const AUTO_UNEMPTY = { general: { autoUnempty: [true] } };

// A bulk paste should never take longer than this.
const MAX_BULK_PASTE_MS = 15000;

// Reading the whole Player table from the file takes a few seconds,
// so give polls on file data more time than the 5s default.
const FILE_POLL_OPTIONS = { timeout: 30000 };

let app;

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});
test.afterEach(async () => {
  await app?.close();
  app = null;
});

async function launchApp(preferences) {
  app = new App(await electron.launchWithDefaultOptions({ preferences }));
  const window = await app.getMainWindow();

  const welcome = new WelcomePage(window);
  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(careerPath);

  return { window, welcome };
}

async function openPlayerTable(preferences) {
  const { window, welcome } = await launchApp(preferences);
  await welcome.openTableEditor();

  const tableEditor = new TableEditorPage(window);
  await tableEditor.openTableById(PLAYER_TABLE_ID);
  return tableEditor;
}

// Saves, then reads the LastName column back from the file on disk
async function saveAndReadLastNamesFromDisk() {
  await app.saveFile();
  const table = await readSavedTable(careerPath, PLAYER_TABLE_ID, ["LastName"]);
  return table.records.map((record) => record.LastName);
}

async function readPlayerColumn(fieldName) {
  const table = await app.readTable(PLAYER_TABLE_ID, [fieldName]);
  return table.records.map((record) => record[fieldName]);
}

async function readEmptyPlayerRows() {
  const table = await app.readTable(PLAYER_TABLE_ID, ["LastName"]);
  return table.emptyRecordIndices;
}

// One value per line pastes down a single column
function columnOfValues(values) {
  return values.join("\n");
}

test("pasting 2,500 cells stays responsive and shows the loader", async () => {
  // Pasting into empty rows also un-empties them, which is the most work per cell
  const tableEditor = await openPlayerTable(AUTO_UNEMPTY);

  const lastNames = Array.from({ length: 2500 }, (_, i) => `Bulk${i}`);
  await tableEditor.goToCell(0, "LastName");

  const start = Date.now();
  await tableEditor.pasteAtSelectedCell(app, columnOfValues(lastNames));
  await tableEditor.waitForLoaderToShowAndHide();
  expect(Date.now() - start).toBeLessThan(MAX_BULK_PASTE_MS);

  // the app still responds to input after the paste
  await tableEditor.goToCell(2499, "LastName");
  expect(await tableEditor.getTextAtSelectedCell()).toBe("Bulk2499");
  expect(await tableEditor.isSelectedCellEmpty()).toBe(false);

  // every value made it into the file
  const fileLastNames = await readPlayerColumn("LastName");
  expect(fileLastNames.slice(0, 2500)).toEqual(lastNames);
});

test("pasting into empty rows un-empties them and removes the empty styling", async () => {
  const tableEditor = await openPlayerTable(AUTO_UNEMPTY);

  await tableEditor.goToCell(FIRST_EMPTY_PLAYER_ROWS[0], "LastName");
  expect(await tableEditor.isSelectedCellEmpty()).toBe(true);

  await tableEditor.pasteAtSelectedCell(app, columnOfValues(["Empty1", "Empty2", "Empty3", "Empty4"]));
  await tableEditor.waitForLoaderToShowAndHide();

  // the pasted rows are no longer empty in the grid...
  for (const row of FIRST_EMPTY_PLAYER_ROWS) {
    await tableEditor.goToCell(row, "LastName");
    expect(await tableEditor.isSelectedCellEmpty()).toBe(false);
  }
  expect(await tableEditor.getTextAtSelectedCell()).toBe("Empty4");

  // ...or in the file
  const emptyRows = await readEmptyPlayerRows();
  for (const row of FIRST_EMPTY_PLAYER_ROWS) {
    expect(emptyRows).not.toContain(row);
  }

  // rows that were not pasted into stay empty
  expect(emptyRows).toContain(NEXT_EMPTY_PLAYER_ROW);
  await tableEditor.goToCell(NEXT_EMPTY_PLAYER_ROW, "LastName");
  expect(await tableEditor.isSelectedCellEmpty()).toBe(true);
});

test("undo and redo after a bulk paste are saved to the file", async () => {
  // Rows before the first empty row, so undo puts back real names
  const rowCount = FIRST_EMPTY_PLAYER_ROWS[0];
  const pastedNames = Array.from({ length: rowCount }, (_, i) => `Undo${i}`);

  const tableEditor = await openPlayerTable();
  const originalNames = (await readPlayerColumn("LastName")).slice(0, rowCount);

  await tableEditor.goToCell(0, "LastName");
  await tableEditor.pasteAtSelectedCell(app, columnOfValues(pastedNames));
  await tableEditor.waitForLoaderToShowAndHide();
  expect((await readPlayerColumn("LastName")).slice(0, rowCount)).toEqual(pastedNames);

  /** Ctrl+Z puts the original names back, in the grid and in the saved file */
  await tableEditor.undo();
  await tableEditor.waitForLoaderToShowAndHide();
  await tableEditor.goToCell(0, "LastName");
  expect(await tableEditor.getTextAtSelectedCell()).toBe(originalNames[0]);
  expect((await saveAndReadLastNamesFromDisk()).slice(0, rowCount)).toEqual(originalNames);

  /** Ctrl+Y puts the pasted names back, in the grid and in the saved file */
  await tableEditor.redo();
  await tableEditor.waitForLoaderToShowAndHide();
  await tableEditor.goToCell(0, "LastName");
  expect(await tableEditor.getTextAtSelectedCell()).toBe(pastedNames[0]);
  expect((await saveAndReadLastNamesFromDisk()).slice(0, rowCount)).toEqual(pastedNames);
});

test("a paste with one invalid value only reverts that cell", async () => {
  const tableEditor = await openPlayerTable();
  const [originalRow0, originalRow1, originalRow2] = await readPlayerColumn("InjuryStatus");
  expect([originalRow0, originalRow1, originalRow2]).toEqual(["Uninjured", "Uninjured", "Uninjured"]);

  await tableEditor.goToCell(0, "InjuryStatus");
  await tableEditor.pasteAtSelectedCell(app, columnOfValues(["Injured", "NotAStatus", "EarlyReturn"]));
  await tableEditor.waitForLoaderToShowAndHide();

  // the file keeps the valid values and rejects the invalid one
  const injuryStatuses = await readPlayerColumn("InjuryStatus");
  expect(injuryStatuses.slice(0, 3)).toEqual(["Injured", "Uninjured", "EarlyReturn"]);

  // the grid shows the same thing
  await tableEditor.goToCell(0, "InjuryStatus");
  expect(await tableEditor.getTextAtSelectedCell()).toBe("Injured");
  await tableEditor.goToCell(1, "InjuryStatus");
  await expect.poll(() => tableEditor.getTextAtSelectedCell()).toBe("Uninjured");
  await tableEditor.goToCell(2, "InjuryStatus");
  expect(await tableEditor.getTextAtSelectedCell()).toBe("EarlyReturn");
});

test("schedule editor changes are saved to the file", async () => {
  const { window, welcome } = await launchApp();
  await welcome.openScheduleEditor();

  const schedule = new ScheduleEditorPage(window);
  await schedule.waitForScheduleToLoad();

  const seasonGameTableId = await app.findTableIdByName("SeasonGame");
  const readGameDays = async () =>
    (await app.readTable(seasonGameTableId, ["DayOfWeek"])).records.map(
      (game) => game.DayOfWeek,
    );
  const daysBefore = await readGameDays();

  const newDay = (await schedule.getDayOfGame(0)) === "Wed" ? "Fri" : "Wed";
  const newDayName = newDay === "Wed" ? "Wednesday" : "Friday";
  await schedule.setDayOfGame(0, newDay);

  // exactly one game in the file changed, to the new day
  await expect
    .poll(async () => {
      const daysAfter = await readGameDays();
      return daysAfter.filter((day, index) => day !== daysBefore[index]);
    }, FILE_POLL_OPTIONS)
    .toEqual([newDayName]);
});
