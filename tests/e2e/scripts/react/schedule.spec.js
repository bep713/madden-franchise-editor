const fs = require("fs");
const path = require("path");
const { expect } = require("chai");
const { test } = require("../../util/test");

const electron = require("../../util/Electron");
const { stubOpenDialog } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");
const { readSavedTable, readTableFromDisk } = require("../../util/diskReader");

const App = require("../../models/App");
const WelcomePage = require("../../models/react/WelcomePage");
const NavigationBar = require("../../models/react/NavigationBar");
const TableEditorPage = require("../../models/react/TableEditorPage");
const ScheduleEditorPage = require("../../models/react/ScheduleEditorPage");

const SEASON_GAME_TABLE_ID = 4146;
const SEASON_GAME_TAB = "4146 - SeasonGame";
const TEAM_TABLE_ID = 7482;
const GAME_FIELDS = ["AwayTeam", "HomeTeam", "DayOfWeek", "TimeOfDay"];
const MAIN_TABS = ["Home", "Schedule", "Schemas"];
const AUTO_SAVE_ON = { general: { autoSave: [true] } };
// Polls on the file on disk parse the whole file each time
const DISK_POLL = { timeout: 30000 };

let careerPath;
test.beforeEach(({ sandbox }) => {
  careerPath = sandbox.careerPath;
});

async function openSchedule(preferences) {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences,
  });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);
  const schedule = new ScheduleEditorPage(window);

  await welcome.waitForPageLoad();
  await welcome.openFranchiseFile(electronApp, careerPath);
  await welcome.openScheduleEditor();
  await nav.waitForActiveTab("Schedule");
  await schedule.waitForLoad();
  return { electronApp, app, window, nav, schedule };
}

// "<record>.<field>=<value>" for every field that differs
function changedFields(before, after) {
  const changes = [];
  after.records.forEach((record, i) => {
    for (const [field, value] of Object.entries(record)) {
      if (before.records[i][field] !== value) {
        changes.push(`${i}.${field}=${value}`);
      }
    }
  });
  return changes;
}

async function readGamesInMemory(app) {
  return app.readTable(SEASON_GAME_TABLE_ID, GAME_FIELDS);
}

// Team abbreviations the schedule shows, by Team table row
async function teamRows(app) {
  const team = await app.readTable(TEAM_TABLE_ID, ["ShortName"]);
  return team.records.map((record) => record.ShortName);
}

function decodeReference(binary) {
  return {
    tableId: parseInt(binary.slice(0, 15), 2),
    recordIndex: parseInt(binary.slice(15), 2),
  };
}

// The highlighted row header of the selected cell
async function waitForSelectedRow(window, row) {
  const header = window.locator(".ht_clone_inline_start tbody th.ht__highlight");
  await poll(
    () => header.first().innerText(),
    (text) => text.trim() === String(row),
    { message: `Row ${row} was not selected` },
  );
  // Scrolled into view, not hidden under the column headers
  await poll(
    () =>
      window.evaluate(() => {
        const cell = document.querySelector(".ht_master td.current");
        if (!cell) return false;
        const box = cell.getBoundingClientRect();
        const hit = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        );
        return !!hit && cell.contains(hit);
      }),
    (visible) => visible,
    { message: `Row ${row} was not scrolled into view` },
  );
}

test("loads the weeks and games (react)", async () => {
  const { electronApp, schedule } = await openSchedule();

  const weeks = await schedule.weekButtons();
  expect(weeks).to.have.length(28);
  expect(await schedule.selectedWeek()).to.equal("P1");
  expect((await schedule.games()).length).to.be.greaterThan(0);

  await schedule.selectWeek("1");
  const games = await schedule.games();
  expect(games).to.have.length(16);
  expect(await schedule.view()).to.equal("default");
  for (const game of games) {
    expect(game.away).to.match(/^[A-Z]{2,3}$/);
    expect(game.home).to.match(/^[A-Z]{2,3}$/);
  }

  await electronApp.close();
});

// Also the React port of bulk-edit.spec.js's "schedule editor changes are
// saved to the file"
test("edits are auto-saved to the file (react)", async () => {
  const { electronApp, app, schedule } = await openSchedule(AUTO_SAVE_ON);
  const before = await readSavedTable(
    careerPath,
    SEASON_GAME_TABLE_ID,
    GAME_FIELDS,
  );

  await schedule.selectWeek("1");
  const [game] = await schedule.games();
  const newDay = game.day === "Monday" ? "Tuesday" : "Monday";
  const newTime = game.time === "21:05" ? "21:10" : "21:05";
  const newMinutes = newTime === "21:05" ? 21 * 60 + 5 : 21 * 60 + 10;
  const newAway = game.away === "SF" ? "CHI" : "SF";
  const newAwayRow = (await teamRows(app)).indexOf(newAway);

  await schedule.setDay(0, newDay);
  await schedule.setTime(0, newTime);
  await schedule.setTeam(0, "away", newAway);

  const record = game.recordIndex;
  const changes = await poll(
    async () => {
      const after = await readTableFromDisk(
        careerPath,
        SEASON_GAME_TABLE_ID,
        GAME_FIELDS,
      );
      return after ? changedFields(before, after) : [];
    },
    (changes) => changes.length === 3,
    { ...DISK_POLL, message: "The edits never reached the file" },
  );
  expect(changes.map((c) => c.split("=")[0]).sort()).to.deep.equal(
    [`${record}.AwayTeam`, `${record}.DayOfWeek`, `${record}.TimeOfDay`].sort(),
  );
  expect(changes).to.include(`${record}.DayOfWeek=${newDay}`);
  expect(changes).to.include(`${record}.TimeOfDay=${newMinutes}`);

  const away = changes
    .find((c) => c.startsWith(`${record}.AwayTeam=`))
    .split("=")[1];
  expect(decodeReference(away)).to.deep.equal({
    tableId: TEAM_TABLE_ID,
    recordIndex: newAwayRow,
  });

  // the page shows the edits
  const [shown] = await schedule.games();
  expect(shown).to.include({ day: newDay, time: newTime, away: newAway });

  await electronApp.close();
});

test("edits wait for Save when auto-save is off (react)", async () => {
  // Tests run with auto-save off
  const { electronApp, app, schedule } = await openSchedule();
  const before = await readSavedTable(
    careerPath,
    SEASON_GAME_TABLE_ID,
    GAME_FIELDS,
  );

  await schedule.selectWeek("1");
  const [game] = await schedule.games();
  const newDay = game.day === "Monday" ? "Tuesday" : "Monday";
  await schedule.setDay(0, newDay);

  // in memory, and Save is enabled
  await poll(
    async () => (await readGamesInMemory(app)).records[game.recordIndex],
    (record) => record.DayOfWeek === newDay,
    { message: "The edit was not written to the file in memory" },
  );
  expect(await app.isMenuItemEnabled("Save")).to.equal(true);

  // not on disk
  const unsaved = await readSavedTable(
    careerPath,
    SEASON_GAME_TABLE_ID,
    GAME_FIELDS,
  );
  expect(changedFields(before, unsaved)).to.deep.equal([]);

  await app._clickMenuItem("Save");
  const changes = await poll(
    async () => {
      const after = await readTableFromDisk(
        careerPath,
        SEASON_GAME_TABLE_ID,
        GAME_FIELDS,
      );
      return after ? changedFields(before, after) : [];
    },
    (changes) => changes.length > 0,
    { ...DISK_POLL, message: "Save did not write the edit" },
  );
  expect(changes).to.deep.equal([`${game.recordIndex}.DayOfWeek=${newDay}`]);

  await electronApp.close();
});

test("a cleared time reverts and is not written (react)", async () => {
  const { electronApp, app, schedule } = await openSchedule();
  const before = await readGamesInMemory(app);

  await schedule.selectWeek("1");
  const [game] = await schedule.games();
  const input = schedule.timeInput(0);
  await input.fill("");
  await input.blur();
  await poll(
    () => input.inputValue(),
    (value) => value === game.time,
    { message: "The time was not reverted" },
  );

  expect(changedFields(before, await readGamesInMemory(app))).to.deep.equal(
    [],
  );
  expect(await schedule.errorAlert()).to.equal(null);

  await electronApp.close();
});

test("the table view is remembered and edits (react)", async () => {
  const { electronApp, app, schedule } = await openSchedule();

  await schedule.setView("Table");
  await poll(
    () => schedule.view(),
    (view) => view === "compact",
    { message: "The table view was not shown" },
  );
  const prefsFile = path.join(electron.userDataDir, "preferences.json");
  await poll(
    () => JSON.parse(fs.readFileSync(prefsFile, "utf8")).schedule?.view,
    (view) => view === "compact",
    { message: "The view was not saved to the preferences" },
  );

  await schedule.selectWeek("1");
  const [game] = await schedule.games();
  const newDay = game.day === "Monday" ? "Tuesday" : "Monday";
  await schedule.setDay(0, newDay);
  await poll(
    async () => (await readGamesInMemory(app)).records[game.recordIndex],
    (record) => record.DayOfWeek === newDay,
    { message: "The table view edit was not written" },
  );

  await electronApp.close();
});

test("opens in the stored view (react)", async () => {
  const { electronApp, schedule } = await openSchedule({
    schedule: { view: "compact" },
  });
  await poll(
    () => schedule.view(),
    (view) => view === "compact",
    { message: "The stored view was not used" },
  );
  await electronApp.close();
});

test("lists the teams on bye (react)", async () => {
  const { electronApp, schedule } = await openSchedule();

  // Week 1: every team plays
  await schedule.selectWeek("1");
  expect(await schedule.games()).to.have.length(16);
  expect(await schedule.byeTeams()).to.deep.equal([]);

  // The first regular-season week with byes
  let byeWeek;
  for (let week = 2; week <= 18 && !byeWeek; week++) {
    await schedule.selectWeek(String(week));
    const games = await schedule.games();
    if (games.length > 0 && games.length < 16) byeWeek = games;
  }
  expect(byeWeek, "No regular-season week with byes").to.not.equal(undefined);

  const byes = await schedule.byeTeams();
  expect(byes).to.have.length(32 - 2 * byeWeek.length);
  const playing = byeWeek.flatMap((game) => [game.home, game.away]);
  for (const team of byes) expect(playing).to.not.include(team);

  await electronApp.close();
});

test("view a game in the table editor (react)", async () => {
  test.setTimeout(60 * 1000);
  const { electronApp, window, nav, schedule } = await openSchedule();
  const tableEditor = new TableEditorPage(window);

  await schedule.selectWeek("1");
  const [game] = await schedule.games();

  // the button (table view only) opens a new active tab at the game's row
  await schedule.setView("Table");
  await schedule.viewInTable(0);
  await nav.waitForActiveTab(SEASON_GAME_TAB);
  await tableEditor.waitForTableToLoad();
  await waitForSelectedRow(window, game.recordIndex);
  expect(await nav.tabNames()).to.deep.equal([...MAIN_TABS, SEASON_GAME_TAB]);

  // so does the right-click menu, in the default view too
  await nav.openTab("Schedule");
  await schedule.waitForLoad();
  await schedule.setView("Default");
  await schedule.selectWeek("1");
  const second = (await schedule.games())[1];
  await schedule.viewInTableByContextMenu(1);
  await poll(
    () => nav.tabCount(),
    (count) => count === 5,
    { message: "The context menu did not open a new tab" },
  );
  // The new tab is the active one. Not clicked: Handsontable drops the
  // selection on an outside click.
  expect(
    await nav.tabs.last().getAttribute("aria-selected"),
  ).to.equal("true");
  await nav.waitForActiveTab(SEASON_GAME_TAB);
  await tableEditor.waitForTableToLoad();
  await waitForSelectedRow(window, second.recordIndex);

  await electronApp.close();
});

test("default editor opens the schedule (react)", async () => {
  const electronApp = await electron.launchWithDefaultOptions({
    ui: "react",
    preferences: { general: { defaultEditor: "open-schedule" } },
  });
  const app = new App(electronApp);
  const window = await app.getMainWindow();
  const welcome = new WelcomePage(window);
  const nav = new NavigationBar(window);
  const schedule = new ScheduleEditorPage(window);

  await welcome.waitForPageLoad();
  // Not welcome.openFranchiseFile, which waits on the Welcome page
  await stubOpenDialog(electronApp, careerPath);
  await welcome.locators.openFileLink.click();

  await nav.waitForActiveTab("Schedule");
  await schedule.waitForLoad();
  expect(await schedule.selectedWeek()).to.equal("P1");

  await electronApp.close();
});

test("the schedule re-reads table editor edits (react)", async () => {
  test.setTimeout(90 * 1000);
  const { electronApp, app, window, nav, schedule } = await openSchedule();
  const tableEditor = new TableEditorPage(window);

  await schedule.selectWeek("1");
  const [game] = await schedule.games();
  const newDay = game.day === "Monday" ? "Tuesday" : "Monday";

  await schedule.viewInTableByContextMenu(0);
  await nav.waitForActiveTab(SEASON_GAME_TAB);
  await tableEditor.waitForTableToLoad();
  const headers = (await app.readTable(SEASON_GAME_TABLE_ID)).headers.map(
    (header) => header.name,
  );
  await tableEditor.grid.selectCell(game.recordIndex, "DayOfWeek", headers);
  await tableEditor.grid.chooseDropdownOptionAtSelectedCell(newDay);
  await poll(
    async () => (await readGamesInMemory(app)).records[game.recordIndex],
    (record) => record.DayOfWeek === newDay,
    { message: "The table editor edit was not written" },
  );

  await nav.openTab("Schedule");
  await schedule.waitForLoad();
  await schedule.selectWeek("1");
  await poll(
    async () => (await schedule.games())[0],
    (shown) => shown.recordIndex === game.recordIndex && shown.day === newDay,
    { message: "The schedule did not show the new day" },
  );

  await electronApp.close();
});
