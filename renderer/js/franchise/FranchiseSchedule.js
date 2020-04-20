const moment = require('moment');
const { ipcRenderer } = require('electron');
const FranchiseGame = require('./FranchiseGame');
const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const dayOfWeekData = require('../../../data/dayOfWeekData.json');
const seasonWeekData = require('../../../data/seasonWeekData.json');
const maddenFranchiseUtil = require('madden-franchise/services/utilService');

const pathToTeamData = '../../../data/teamData.json';

class FranchiseSchedule extends EventEmitter {
  constructor(file) {
    super();
    this.NUMBER_WEEKS_SEASON = 25;
    this.file = file;
    this.games = [];
    this.startTimes = null;
    this._teamData = require(pathToTeamData);

    if (!file.isLoaded) {
      file.on('ready', () => {
        this.parse();
      });
    } else {
      this.parse();
    }
  };

  parse() {
    delete require.cache[require.resolve(pathToTeamData)]
    this._teamData = require(pathToTeamData);
    
    const seasonGameTable = this.file.getTableByName('SeasonGame');
    const teamTable = this.file.tables.find((table) => {
      return table.name === 'Team' && table.header.data1RecordCount > 1;
    });
    const schedulerTable = this.file.getTableByName('Scheduler');
    const appointmentTable = this.file.getTableByName('Scheduler.Appointment');
    const gameEventTable = this.file.getTableByName('GameEvent');

    const seasonGameFields = ['AwayTeam', 'HomeTeam', 'TimeOfDay', 'HomeScore', 'AwayScore', 'SeasonWeek', 'SeasonGameNum', 'SeasonYear', 'DayOfWeek', 'SeasonWeekType', 'IsPractice'];
    const teamFields = ['ShortName', 'LongName', 'DisplayName'];
    const appointmentFields = ['StartEvent', 'StartOccurrenceTime', 'Name']

    const that = this;

    let schedulerLoaded = schedulerTable.readRecords();

    schedulerLoaded.then(() => {
      const epochReferenceData = maddenFranchiseUtil.getReferenceData(schedulerTable.records[0].Epoch);
      const epochTable = this.file.getTableById(epochReferenceData.tableId);

      let tablesLoaded = Promise.all([seasonGameTable.readRecords(seasonGameFields), teamTable.readRecords(teamFields),
        epochTable.readRecords(), appointmentTable.readRecords(appointmentFields), gameEventTable.readRecords()]);
  
      tablesLoaded.then(() => {  
        this.startTimes = getStartTimes(schedulerTable, epochTable, epochReferenceData);

        // In case someone has added in custom teams that aren't in our metadata,
        // we read the team table to get information about them.
        // They won't have their logo, but they should have all other attributes.
  
        teamTable.records.forEach((team, index) => {
          let teamInMetadata = this._getTeamByFullName(`${team.LongName} ${team.DisplayName}`);
          if (!teamInMetadata) {
            this._teamData.teams.push({
              'city': team.LongName,
              'nickname': team.DisplayName,
              'abbreviation': team.ShortName,
              'logoPath': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAB4AAAAeCAQAAACROWYpAAAAHElEQVR42mNkoAAwjmoe1TyqeVTzqOZRzcNZMwB18wAfEFQkPQAAAABJRU5ErkJggg==',
              'nameMatchList': [`${team.LongName} ${team.DisplayName}`],
              'referenceIndex': index,
              'existsInTeamTable': true
            });
          } else {
            teamInMetadata.referenceIndex = index;
            teamInMetadata.existsInTeamTable = true;
          }
        });
  
        this._teamData.teams = this._teamData.teams.sort((a, b) => {
          var nameA = a.abbreviation;
          var nameB = b.abbreviation;
  
          if (nameA < nameB) { return -1; }
          else if (nameA > nameB) { return 1; }
          else { return 0; }
        });
  
        // We want to map all appointments to their season games.
        // To do this, we loop through all appointment records and filter
        // the records which have a referenced GameEvent as their StartEvent.
  
        // We then follow the GameEvent reference and follow the SeasonGame reference
        // to get the SeasonGame index. The appointmentMap variable will be used when
        // iterating through each SeasonGame (after this block) to create
        // the correct association.
  
        let appointmentMap = {};
  
        appointmentTable.records
          .filter((record) => {
            return maddenFranchiseUtil.getReferenceData(record.StartEvent).tableId === gameEventTable.header.tableId;
          })
          .forEach((record) => {
            const referencedGameEvent = this.file.getReferencedRecord(record.StartEvent);
            const referencedSeasonGame = this.file.getReferencedRecord(referencedGameEvent.SeasonGame);
  
            appointmentMap[referencedSeasonGame.index] = record;
          });
  
        seasonGameTable.records.forEach((record, index) => {
          if (record.IsPractice || record.SeasonYear !== this.startTimes.seasonYear) {
            return;
          }
  
          let game = new FranchiseGame(record, index);
          
          if (record.HomeTeam !== '00000000000000000000000000000000') {
            const recordIndex = utilService.bin2dec(record.HomeTeam.substring(16));
            game._homeTeam = this._getTeamByFullName(`${teamTable.records[recordIndex].LongName} ${teamTable.records[recordIndex].DisplayName}`);
          }
  
          if (record.AwayTeam !== '00000000000000000000000000000000') {
            const recordIndex = utilService.bin2dec(record.AwayTeam.substring(16));
            game._awayTeam = this._getTeamByFullName(`${teamTable.records[recordIndex].LongName} ${teamTable.records[recordIndex].DisplayName}`);
          }
  
          game.appointment = appointmentMap[record.index];
          this.games.push(game);
  
          game.on('change', () => {
            if (ipcRenderer.sendSync('getPreferences').general.autoSave[0]) {
              that.file.save();
            }
          });
        });
  
        this.emit('ready');
      });
    });
  };

  get teamData () {
    return this._teamData.teams.filter((team) => { return team.existsInTeamTable; });
  };

  getGameByOffset(offset) {
    return this.games.find((game) => {
      return game.offset == offset;
    });
  };

  getGamesInWeek(weekNum) {
    const week = seasonWeekData.weeks[weekNum];

    return this.games.filter((game) => {
      const gameRecord = game.gameRecord;
      return gameRecord.SeasonWeek === week.weekIndex && gameRecord.SeasonWeekType === week.seasonWeekType && game.homeTeam !== null && game.awayTeam !== null;
    });
  };

  replaceAllGamesWithFile(file) {
    const hasPreseasonGames = file.weeks.find((week) => { return week.type === 'preseason'; });
    let currentIndex = 0;
    let gamesToReplace;

    let weekStartTime = moment(this.startTimes.preseasonStart.utc()).subtract(this.startTimes.epochStart.utc().unix(), 's');

    // Get a list of games in the franchise file to replace
    // These may not be in order, so we will sort based on season week
    if (hasPreseasonGames) {
      gamesToReplace = this.games.filter((game) => { return (game.gameRecord.SeasonWeekType === 'PreSeason' || game.gameRecord.SeasonWeekType === 'RegularSeason') && game.homeTeam !== null && game.awayTeam !== null; });
    } else {
      gamesToReplace = this.games.filter((game) => { return game.gameRecord.SeasonWeekType === 'RegularSeason' && game.homeTeam !== null && game.awayTeam !== null; });

      // if there are no preseason games in the schedule,
      // skip 4 weeks on the weekly start time.
      weekStartTime.add(4, 'w');
    }

    gamesToReplace.sort((a, b) => {
      return a.gameRecord.SeasonWeek - b.gameRecord.SeasonWeek;
    });

    const weeksToAdd = file.weeks.filter((week) => { return (week.type === 'preseason' && week.number > 1) || week.type === 'season'});

    const that = this;

    // Get all weeks in the JSON file
    weeksToAdd.forEach((week, weekIndex) => {
      if (week.type === 'preseason' && week.number > 1) {
        week.number -= 1;
      }

      // Get metadata for the iteration week
      let seasonWeek = getSeasonWeekDataByWeekIndexAndType(week.number, week.type);

      // Get all games in the JSON file in the selected week
      // These should be in order.
      week.games.forEach((game, gameIndex) => {
        const awayTeam = that._getTeamByFullName(game.awayTeam);
        const homeTeam = that._getTeamByFullName(game.homeTeam);
        const day = getDayOfWeekByAbbreviation(game.day);
        const time = moment.utc(game.time, "hh:mm A");
        
        const gameMinutesSinceMidnight = time.hours() * 60 + time.minutes();
        const daysToAdd = getDaysToAdd(day.name);
        const gameEpochTime = moment(weekStartTime).add(daysToAdd, 'd').add(gameMinutesSinceMidnight, 'm');

        let currentGame = gamesToReplace[currentIndex];
        const changeListeners = currentGame.listeners('change');

        changeListeners.forEach((listener) => {
          currentGame.off('change', listener);
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
          currentGame.on('change', listener);
        });

        currentIndex += 1;
      });

      if (week.type === 'preseason') {
        week.number += 1;
      }

      // add a week to the start time for next loop iteration
      weekStartTime.add(1, 'w');
    });

    if (ipcRenderer.sendSync('getPreferences').general.autoSave[0]) {
      this.file.save().then(() => {
        console.log('saved!');
      });
    }
  };

  _getTeamByFullName(name) {
    return this._teamData.teams.find((team) => { return team.nameMatchList.includes(name); });
  };
};

module.exports = FranchiseSchedule;

function getDayOfWeekByAbbreviation(abbreviation) {
  return dayOfWeekData.days.find((day) => { return day.nameMatchList.includes(abbreviation); });
};

function getSeasonWeekDataByWeekIndexAndType(index, type) {
  return seasonWeekData.weeks.find((week) => { return week.weekIndex == index - 1 && week.weekType === type; });
};

function getStartTimes(schedulerTable, epochTable, epochReferenceData) {
  const epochRecord = epochTable.records[epochReferenceData.rowNumber];
  const epochYear = epochRecord.Year + 1900;
  const epochMonth = utilService.bin2dec(epochRecord.getFieldByKey('Month').unformattedValue);
  const epochStart = moment([epochYear, epochMonth, epochRecord.DayOfMonth, epochRecord.Hour, epochRecord.Minute, epochRecord.Second]);

  const currentTime = moment.unix(schedulerTable.records[0].CurrentTime).utc().add(epochStart.unix(), 's');
  const numYears = currentTime.year() - epochYear;
  const currentYear = epochYear + numYears;

  const preseasonStart = moment([currentYear, 7]).startOf('isoweek').add(3, 'd').add(1, 'w');
  const regularSeasonStart = moment(preseasonStart).add(4, 'w');

  return {
    'currentTime': currentTime,
    'seasonYear': numYears,
    'epochStart': epochStart,
    'preseasonStart': preseasonStart,
    'regularSeasonStart': regularSeasonStart,
  };
};

function getDaysToAdd(day) {
  switch(day) {
    case 'Thursday':
      return 0;
    case 'Friday':
      return 1;
    case 'Saturday':
      return 2;
    case 'Sunday':
      return 3;
    case 'Monday':
      return 4;
    case 'Tuesday':
      return 5;
    case 'Wednesday':
      return 6;
  }
};