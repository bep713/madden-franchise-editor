const moment = require("moment");
const FranchiseGame = require("./FranchiseGame");
const EventEmitter = require("events").EventEmitter;
const utilService = require("../services/utilService");
const preferencesService = require("../services/preferencesService");
const dayOfWeekData = require("../../../data/dayOfWeekData.json");
const seasonWeekData = require("../../../data/seasonWeekData.json");
const teamData = require("../../../data/teamData.json");

class FranchiseSchedule extends EventEmitter {
  constructor(fileId) {
    super();
    this.NUMBER_WEEKS_SEASON = 25;
    this.fileId = fileId;
    this.games = [];
    this.startTimes = null;
    this._teamData = teamData;
    this.file = null; // Will be populated when needed

    this.parse();
  }

  async parse() {
    const fileId = this.fileId;

    // Fetch file metadata to get gameYear and table list
    const [
      metadata,
      seasonGameTables,
      teamTables,
      schedulerTables,
      appointmentTables,
      gameEventTables,
    ] = await Promise.all([
      window.franchiseAPI.getMetadata(fileId),
      window.franchiseAPI.findTablesByName(fileId, "SeasonGame"),
      window.franchiseAPI.findTablesByName(fileId, "Team"),
      window.franchiseAPI.findTablesByName(fileId, "Scheduler"),
      window.franchiseAPI.findTablesByName(fileId, "Scheduler.Appointment"),
      window.franchiseAPI.findTablesByName(fileId, "GameEvent"),
    ]);

    this.gameYear = metadata?.gameYear;

    const teamTable = teamTables.find(
      (t) => t.name === "Team" && t.recordCount > 1,
    );

    this.seasonGameTableId = seasonGameTables?.[0]?.id;

    // Get table data via IPC
    const [
      seasonGameData,
      teamTableData,
      schedulerData,
      appointmentData,
      gameEventData,
    ] = await Promise.all([
      window.franchiseAPI.readTableData(fileId, seasonGameTables[0].id, [
        "AwayTeam",
        "HomeTeam",
        "TimeOfDay",
        "HomeScore",
        "AwayScore",
        "SeasonWeek",
        "SeasonGameNum",
        "SeasonYear",
        "DayOfWeek",
        "SeasonWeekType",
        "IsPractice",
      ]),
      window.franchiseAPI.readTableData(fileId, teamTable.id, [
        "ShortName",
        "LongName",
        "DisplayName",
      ]),
      window.franchiseAPI.readTableData(fileId, schedulerTables[0].id),
      window.franchiseAPI.readTableData(fileId, appointmentTables[0].id, [
        "StartEvent",
        "StartOccurrenceTime",
        "Name",
      ]),
      window.franchiseAPI.readTableData(fileId, gameEventTables[0].id),
    ]);

    if (
      !seasonGameData ||
      !teamTableData ||
      !schedulerData ||
      !appointmentData ||
      !gameEventData
    ) {
      this.emit("error", "Failed to load required tables");
    }

    // Validate that tables have records arrays
    if (
      !seasonGameData.records ||
      !schedulerData.records ||
      !appointmentData.records ||
      !gameEventData.records
    ) {
      this.emit("error", "One or more tables missing records array");
    }

    // Validate that none of the tables are using generic schemas
    if (
      seasonGameData.usingGenericSchema ||
      schedulerData.usingGenericSchema ||
      appointmentData.usingGenericSchema ||
      gameEventData.usingGenericSchema ||
      teamTableData.usingGenericSchema
    ) {
      this.emit(
        "error",
        "One or more tables are missing their schemas. Failed to load table data. Navigate to the 'Schemas' tab and ensure the schema is correct.",
      );
    }

    const that = this;

    // Get computed start times via IPC (main process has access to raw field data)
    const startTimesRaw =
      await window.franchiseAPI.schedule.getStartTimes(fileId);
    if (!startTimesRaw) {
      this.emit("error", "Failed to get schedule start times");
      return;
    }

    this.startTimes = {
      currentTime: moment(startTimesRaw.currentTime),
      seasonYear: startTimesRaw.seasonYear,
      epochStart: moment(startTimesRaw.epochStart),
      preseasonStart: moment(startTimesRaw.preseasonStart),
      regularSeasonStart: moment(startTimesRaw.regularSeasonStart),
    };
    console.log(this.startTimes);

    // In case someone has added in custom teams that aren't in our metadata,
    // we read the team table to get information about them.
    // They won't have their logo, but they should have all other attributes.

    teamTableData.records.forEach((team, index) => {
      let teamInMetadata = this._getTeamByFullName(
        `${team.LongName} ${team.DisplayName}`,
      );
      if (!teamInMetadata) {
        this._teamData.teams.push({
          city: team.LongName,
          nickname: team.DisplayName,
          abbreviation: team.ShortName,
          logoPath:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAAAHElEQVR42mNkoAAwjmoe1TyqeVTzqOZRzcNZMwB18wAfEFQkPQAAAABJRU5ErkJggg==",
          nameMatchList: [`${team.LongName} ${team.DisplayName}`],
          referenceIndex: index,
          existsInTeamTable: true,
        });
      } else {
        teamInMetadata.referenceIndex = index;
        teamInMetadata.existsInTeamTable = true;
      }
    });

    this._teamData.teams = this._teamData.teams.sort((a, b) => {
      var nameA = a.abbreviation;
      var nameB = b.abbreviation;

      if (nameA < nameB) {
        return -1;
      } else if (nameA > nameB) {
        return 1;
      } else {
        return 0;
      }
    });

    // We want to map all appointments to their season games.
    // To do this, we loop through all appointment records and filter
    // the records which have a referenced GameEvent as their StartEvent.

    // We then follow the GameEvent reference and follow the SeasonGame reference
    // to get the SeasonGame index. The appointmentMap variable will be used when
    // iterating through each SeasonGame (after this block) to create
    // the correct association.

    let appointmentMap = {};

    appointmentData.records
      .filter((record) => {
        return (
          window.franchiseAPI.getUtilReferenceData(record.StartEvent)
            .tableId === gameEventData.tableId
        );
      })
      .forEach((record) => {
        // For now, we'll need to handle references differently
        // This would need the main process to support getReferencedRecord
        // For now, skip this functionality or implement it via IPC
        console.warn("getReferencedRecord not yet implemented via IPC");
      });

    seasonGameData.records.forEach((record, index) => {
      // Skip epoch logic for M21+ as it causes issues with schedule editing in some files, and it's only needed for the Replace All function
      // which doesn't work on these game years anyway
      if (
        record.IsPractice ||
        (record.SeasonYear !== this.startTimes.seasonYear && this.gameYear < 21)
      ) {
        return;
      }

      let game = new FranchiseGame(record, index);

      if (record.HomeTeam !== "00000000000000000000000000000000") {
        const recordIndex = utilService.bin2dec(record.HomeTeam.substring(16));
        game._homeTeam = this._getTeamByFullName(
          `${teamTableData.records[recordIndex].LongName} ${teamTableData.records[recordIndex].DisplayName}`,
        );
      }

      if (record.AwayTeam !== "00000000000000000000000000000000") {
        const recordIndex = utilService.bin2dec(record.AwayTeam.substring(16));
        game._awayTeam = this._getTeamByFullName(
          `${teamTableData.records[recordIndex].LongName} ${teamTableData.records[recordIndex].DisplayName}`,
        );
      }

      game.appointment = appointmentMap[record.index];
      this.games.push(game);

      game.on("change", async () => {
        if (preferencesService.getValue("general.autoSave")?.[0]) {
          await window.franchiseAPI.saveFile(fileId);
        }
      });
    });

    this.emit("ready");
  }

  get teamData() {
    return this._teamData.teams.filter((team) => {
      return team.existsInTeamTable;
    });
  }

  getGameByOffset(offset) {
    return this.games.find((game) => {
      return game.offset == offset;
    });
  }

  getGamesInWeek(weekNum) {
    const week = seasonWeekData.weeks[weekNum];

    return this.games.filter((game) => {
      const gameRecord = game.gameRecord;
      return (
        gameRecord.SeasonWeek === week.weekIndex &&
        gameRecord.SeasonWeekType === week.seasonWeekType &&
        game.homeTeam !== null &&
        game.awayTeam !== null
      );
    });
  }

  replaceAllGamesWithFile(file) {
    const hasPreseasonGames = file.weeks.find((week) => {
      return week.type === "preseason";
    });
    let currentIndex = 0;
    let gamesToReplace;

    let weekStartTime = moment(this.startTimes.preseasonStart.utc()).subtract(
      this.startTimes.epochStart.utc().unix(),
      "s",
    );

    // Get a list of games in the franchise file to replace
    // These may not be in order, so we will sort based on season week
    if (hasPreseasonGames) {
      gamesToReplace = this.games.filter((game) => {
        return (
          (game.gameRecord.SeasonWeekType === "PreSeason" ||
            game.gameRecord.SeasonWeekType === "RegularSeason") &&
          game.homeTeam !== null &&
          game.awayTeam !== null
        );
      });
    } else {
      gamesToReplace = this.games.filter((game) => {
        return (
          game.gameRecord.SeasonWeekType === "RegularSeason" &&
          game.homeTeam !== null &&
          game.awayTeam !== null
        );
      });

      // if there are no preseason games in the schedule,
      // skip 4 weeks on the weekly start time.
      weekStartTime.add(4, "w");
    }

    gamesToReplace.sort((a, b) => {
      return a.gameRecord.SeasonWeek - b.gameRecord.SeasonWeek;
    });

    const weeksToAdd = file.weeks.filter((week) => {
      return (
        (week.type === "preseason" && week.number > 1) || week.type === "season"
      );
    });

    const that = this;

    // Get all weeks in the JSON file
    weeksToAdd.forEach((week, weekIndex) => {
      if (week.type === "preseason" && week.number > 1) {
        week.number -= 1;
      }

      // Get metadata for the iteration week
      let seasonWeek = getSeasonWeekDataByWeekIndexAndType(
        week.number,
        week.type,
      );

      // Get all games in the JSON file in the selected week
      // These should be in order.
      week.games.forEach((game, gameIndex) => {
        const awayTeam = that._getTeamByFullName(game.awayTeam);
        const homeTeam = that._getTeamByFullName(game.homeTeam);
        const day = getDayOfWeekByAbbreviation(game.day);
        const time = moment.utc(game.time, "hh:mm A");

        const gameMinutesSinceMidnight = time.hours() * 60 + time.minutes();
        const daysToAdd = getDaysToAdd(day.name);
        const gameEpochTime = moment(weekStartTime)
          .add(daysToAdd, "d")
          .add(gameMinutesSinceMidnight, "m");

        let currentGame = gamesToReplace[currentIndex];
        const changeListeners = currentGame.listeners("change");

        changeListeners.forEach((listener) => {
          currentGame.off("change", listener);
        });

        if (currentGame) {
          currentGame.awayTeam = awayTeam;
          currentGame.homeTeam = homeTeam;
          currentGame.dayOfWeek = day;
          currentGame.seasonWeek = seasonWeek;
          currentGame.seasonGameNum = gameIndex;
          currentGame.seasonWeekType = seasonWeek;
          currentGame.time = time;
          currentGame.epochTime = gameEpochTime.unix();
        }

        changeListeners.forEach((listener) => {
          currentGame.on("change", listener);
        });

        currentIndex += 1;
      });

      if (week.type === "preseason") {
        week.number += 1;
      }

      // add a week to the start time for next loop iteration
      weekStartTime.add(1, "w");
    });

    if (preferencesService.getValue("general.autoSave")?.[0]) {
      window.franchiseAPI.saveFile(this.fileId).then(() => {
        console.log("saved!");
      });
    }
  }

  _getTeamByFullName(name) {
    return this._teamData.teams.find((team) => {
      return team.nameMatchList.includes(name);
    });
  }
}

module.exports = FranchiseSchedule;

function getDayOfWeekByAbbreviation(abbreviation) {
  return dayOfWeekData.days.find((day) => {
    return day.nameMatchList.includes(abbreviation);
  });
}

function getSeasonWeekDataByWeekIndexAndType(index, type) {
  let attribute = "weekIndex";

  if (this.gameYear && this.gameYear < 21) {
    attribute = "legacyWeekIndex";
  }

  return seasonWeekData.weeks.find((week) => {
    return week[attribute] == index - 1 && week.weekType === type;
  });
}

function getDaysToAdd(day) {
  switch (day) {
    case "Thursday":
      return 2;
    case "Friday":
      return 3;
    case "Saturday":
      return 4;
    case "Sunday":
      return 5;
    case "Monday":
      return 6;
    case "Tuesday":
      return 0;
    case "Wednesday":
      return 1;
  }
}
