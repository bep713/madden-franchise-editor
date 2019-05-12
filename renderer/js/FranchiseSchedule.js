const moment = require('moment');
const FranchiseGame = require('./FranchiseGame');
const EventEmitter = require('events').EventEmitter;
const teamData = require('../../data/teamData.json');
const seasonWeekData = require('../../data/seasonWeekData.json');
const dayOfWeekData = require('../../data/dayOfWeekData.json');

const PLAYOFF_START_OFFSET = 0x1CEB09;
const PRESEASON_START_OFFSET = 0x1CEEA1;
const WEEK_ONE_START_OFFSET = 0x1D05FD;
const SEASON_END_OFFSET = 0x1D61FD;
const SUPERBOWL_START_OFFSET = 0x1D61FD;
const SEASON_GAME_MAX_OFFSET = 0x1D6DD9;
const GAME_SIZE = 0x5C;

class FranchiseSchedule extends EventEmitter {
  constructor(data) {
    super();
    this.NUMBER_WEEKS_SEASON = 25;
    this.data = data;
    this.games = [];
    // this.initializeWeeks();
    this.parse();
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
    for (var i = PLAYOFF_START_OFFSET; i <= SUPERBOWL_START_OFFSET; i += GAME_SIZE) {
      const game = new FranchiseGame(this.data.slice(i, i + GAME_SIZE), i);
      this.games.push(game);

      const that = this;
      game.on('change', function () {
        that.emit('change', this);
      });
    }
  };

  get hexData () {
    return this.games.reduce((accumulator, current) => {
      return Buffer.concat([accumulator, current.hexData]);
    }, Buffer.from([]));
  };

  getGameByOffset(offset) {
    return this.games.find((game) => {
      return game.offset == offset;
    });
  };

  getGamesInWeek(weekNum) {
    const week = seasonWeekData.weeks[weekNum];

    return this.games.filter((game) => {
      return game.week === week;
    });
  };

  replaceAllGamesWithFile(file) {
    const hasPreseasonGames = file.weeks.find((week) => { return week.type === 'preseason'; });
    let currentIndex = 0;
    let gamesToReplace;

    if (hasPreseasonGames) {
      gamesToReplace = this.games.filter((game) => { return game.week.weekType === 'preseason' || game.week.weekType === 'season'; });
    } else {
      gamesToReplace = this.games.filter((game) => { return game.week.weekType === 'season'; });
    }

    const weeksToAdd = file.weeks.filter((week) => { return (week.type === 'preseason' && week.number > 1) || week.type === 'season'});

    weeksToAdd.forEach((week, weekIndex) => {
      if (week.type === 'preseason' && week.number > 1) {
        week.number -= 1;
      }

      let seasonWeek = getSeasonWeekDataByWeekIndexAndType(week.number, week.type);

      week.games.forEach((game, gameIndex) => {
        const awayTeam = getTeamByFullName(game.awayTeam);
        const homeTeam = getTeamByFullName(game.homeTeam);
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
          currentGame.week = seasonWeek;
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

    this.emit('change-all', {
      startingOffset: PLAYOFF_START_OFFSET,
      endingOffset: SUPERBOWL_START_OFFSET + GAME_SIZE,
      hexData: this.hexData
    });
  };
};

module.exports = FranchiseSchedule;

function getTeamByFullName(name) {
  return teamData.teams.find((team) => { return team.nameMatchList.includes(name); });
};

function getDayOfWeekByAbbreviation(abbreviation) {
  return dayOfWeekData.days.find((day) => { return day.nameMatchList.includes(abbreviation); });
};

function getSeasonWeekDataByWeekIndexAndType(index, type) {
  return seasonWeekData.weeks.find((week) => { return week.weekIndex == index - 1 && week.weekType === type; });
};