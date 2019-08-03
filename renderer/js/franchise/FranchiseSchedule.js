const moment = require('moment');
const { ipcRenderer } = require('electron');
const FranchiseGame = require('./FranchiseGame');
const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const dayOfWeekData = require('../../../data/dayOfWeekData.json');
const seasonWeekData = require('../../../data/seasonWeekData.json');
const franchiseGameYearService = require('../services/franchiseGameYearService');

const pathToTeamData = '../../../data/teamData.json';

const PLAYOFF_START_OFFSET = 0x1CEB09;
const PRESEASON_START_OFFSET = 0x1CEEA1;
const WEEK_ONE_START_OFFSET = 0x1D05FD;
const SEASON_END_OFFSET = 0x1D61FD;
const SUPERBOWL_START_OFFSET = 0x1D61FD;
const SEASON_GAME_MAX_OFFSET = 0x1D6DD9;
const GAME_SIZE = 0x5C;

class FranchiseSchedule extends EventEmitter {
  constructor(file) {
    super();
    this.NUMBER_WEEKS_SEASON = 25;
    // this.data = data;
    this.file = file;
    this.games = [];
    this._teamData = require(pathToTeamData);
    // this.initializeWeeks();

    if (!file.isLoaded) {
      file.on('ready', () => {
        this.parse();
      });
    } else {
      this.parse();
    }
  };

  // initializeWeeks() {
  //   for(let i = 0; i < NUMBER_WEEKS_SEASON; i++) {
  //     this.weeks.push({
  //       'weekTitle': getWeekTitle(i),
  //       'weekType': getWeekType(i),
  //       'games': []
  //     });
  //   }
  // };

  parse() {
    delete require.cache[require.resolve(pathToTeamData)]
    this._teamData = require(pathToTeamData);
    
    const seasonGameTable = this.file.getTableById(franchiseGameYearService.getTableId('SeasonGame', this.file._gameYear));
    const teamTable = this.file.getTableById(franchiseGameYearService.getTableId('Team', this.file._gameYear));

    const seasonGameFields = ['AwayTeam', 'HomeTeam', 'TimeOfDay', 'HomeScore', 'AwayScore', 'SeasonWeek', 'DayOfWeek', 'SeasonWeekType'];
    const teamFields = ['ShortName', 'LongName', 'DisplayName'];

    const that = this;
  
    let tablesLoaded = Promise.all([seasonGameTable.readRecords(seasonGameFields), teamTable.readRecords(teamFields)]);
    tablesLoaded.then(() => {
      console.log(seasonGameTable);
      console.log(teamTable);

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

      seasonGameTable.records.forEach((record, index) => {
        let game = new FranchiseGame(record, index);
        
        if (record.HomeTeam !== '00000000000000000000000000000000') {
          const recordIndex = utilService.bin2dec(record.HomeTeam.substring(16));
          game._homeTeam = this._getTeamByFullName(`${teamTable.records[recordIndex].LongName} ${teamTable.records[recordIndex].DisplayName}`);
        }

        if (record.AwayTeam !== '00000000000000000000000000000000') {
          const recordIndex = utilService.bin2dec(record.AwayTeam.substring(16));
          game._awayTeam = this._getTeamByFullName(`${teamTable.records[recordIndex].LongName} ${teamTable.records[recordIndex].DisplayName}`);
        }

        this.games.push(game);

        game.on('change', () => {
          if (ipcRenderer.sendSync('getPreferences').general.autoSave[0]) {
            that.file.save();
          }
        });
      });

      this.emit('ready');
    });

    // for (var i = PLAYOFF_START_OFFSET; i <= SUPERBOWL_START_OFFSET; i += GAME_SIZE) {
    //   const game = new FranchiseGame(this.data.slice(i, i + GAME_SIZE), i);
    //   this.games.push(game);

    //   const that = this;
    //   game.on('change', function () {
    //     that.emit('change', this);
    //   });
    // }
  };

  get teamData () {
    return this._teamData.teams.filter((team) => { return team.existsInTeamTable; });
  };

  // get hexData () {
  //   return this.games.reduce((accumulator, current) => {
  //     return Buffer.concat([accumulator, current.hexData]);
  //   }, Buffer.from([]));
  // };

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

    if (hasPreseasonGames) {
      gamesToReplace = this.games.filter((game) => { return (game.gameRecord.SeasonWeekType === 'PreSeason' || game.gameRecord.SeasonWeekType === 'RegularSeason') && game.homeTeam !== null && game.awayTeam !== null; });
    } else {
      gamesToReplace = this.games.filter((game) => { return game.gameRecord.SeasonWeekType === 'RegularSeason' && game.homeTeam !== null && game.awayTeam !== null; });
    }

    const weeksToAdd = file.weeks.filter((week) => { return (week.type === 'preseason' && week.number > 1) || week.type === 'season'});

    const that = this;

    weeksToAdd.forEach((week, weekIndex) => {
      if (week.type === 'preseason' && week.number > 1) {
        week.number -= 1;
      }

      let seasonWeek = getSeasonWeekDataByWeekIndexAndType(week.number, week.type);

      week.games.forEach((game, gameIndex) => {
        const awayTeam = that._getTeamByFullName(game.awayTeam);
        const homeTeam = that._getTeamByFullName(game.homeTeam);
        const day = getDayOfWeekByAbbreviation(game.day);
        const time = moment.utc(game.time, "hh:mm A");

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
          currentGame.seasonWeekType = seasonWeek;
          currentGame.time = time;
        }

        changeListeners.forEach((listener) => {
          currentGame.on('change', listener);
        });

        currentIndex += 1;
      });

      if (week.type === 'preseason') {
        week.number += 1;
      }
    });

    if (ipcRenderer.sendSync('getPreferences').general.autoSave[0]) {
      this.file.save().then(() => {
        console.log('saved!');
      });
    }

    // this.emit('change-all', {
    //   startingOffset: PLAYOFF_START_OFFSET,
    //   endingOffset: SUPERBOWL_START_OFFSET + GAME_SIZE,
    //   hexData: this.hexData
    // });
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