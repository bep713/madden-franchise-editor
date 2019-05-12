const moment = require('moment');
const utilService = require('../js/utilService');
const EventEmitter = require('events').EventEmitter;
const teamData = require('../../data/teamData.json');
const offsetDataService = require('./offsetDataService');
const dayOfWeekData = require('../../data/dayOfWeekData.json');
const seasonWeekData = require('../../data/seasonWeekData.json');

class FranchiseGame extends EventEmitter {
  constructor(data, offset) {
    super();
    offsetDataService.parse();
    this.offsetData = offsetDataService.getTable('SeasonGame');
    this.scheduleData = utilService.getBitArray(data);
    this.offset = offset;
    this.parse();
  };

  parse() {
    const awayTeamOffset = this.offsetData.getOffsetFor('awayTeam');
    const homeTeamOffset = this.offsetData.getOffsetFor('homeTeam');
    const gameTimeOffset = this.offsetData.getOffsetFor('timeOfDay');
    const seasonWeekOffset = this.offsetData.getOffsetFor('seasonWeek');
    const dayOfWeekOffset = this.offsetData.getOffsetFor('dayOfWeek');
    const weekTypeOffset = this.offsetData.getOffsetFor('weekType');

    this.awayTeam = this.getTeamByScheduleId(this.data.substr(awayTeamOffset.offset, awayTeamOffset.length));
    this.homeTeam = this.getTeamByScheduleId(this.data.substr(homeTeamOffset.offset, homeTeamOffset.length));
    this.time = this.parseGameTimeString(this.data.substr(gameTimeOffset.offset, gameTimeOffset.length));
    this.weekIndex = this.parseGameWeek(this.data.substr(seasonWeekOffset.offset, seasonWeekOffset.length));
    this.dayOfWeek = this.getDayOfWeekByScheduleId(this.data.substr(dayOfWeekOffset.offset, dayOfWeekOffset.length));
    this.weekType = this.parseWeekType(this.data.substr(weekTypeOffset.offset, weekTypeOffset.length));
    this.week = this.getWeekByIndexAndType(this.weekIndex, this.weekType);
  };

  get awayTeam () {
    return this.away;
  };

  set awayTeam (team) {
    this.away = team;
    const awayTeamOffset = this.offsetData.getOffsetFor('awayTeam');

    const awayTeamBinary = utilService.dec2bin(team.scheduleId, awayTeamOffset.length);
    this.scheduleData = utilService.replaceAt(this.scheduleData, awayTeamOffset.offset, awayTeamBinary);
    this.emit('change');
  };

  get homeTeam () {
    return this.home;
  };

  set homeTeam (team) {
    this.home = team;
    const homeTeamOffset = this.offsetData.getOffsetFor('homeTeam');

    const homeTeamBinary = utilService.dec2bin(team.scheduleId, homeTeamOffset.length);
    this.scheduleData = utilService.replaceAt(this.scheduleData, homeTeamOffset.offset, homeTeamBinary);
    this.emit('change');
  };

  get time () {
    return this.gameTime;
  };

  set time (time) {
    this.gameTime = time;
    const gameTimeOffset = this.offsetData.getOffsetFor('timeOfDay');

    const hours = time.hours();
    const minutes = time.minutes();
    const totalMinutes = hours * 60 + minutes;
    const binaryTime = totalMinutes.toString(2).padStart(gameTimeOffset.length, '0');

    this.scheduleData = utilService.replaceAt(this.scheduleData, gameTimeOffset.offset, binaryTime);
    this.emit('change');
  };

  get week () {
    return this.gameWeek;
  };

  set week (week) {
    this.gameWeek = week;

    const seasonWeekOffset = this.offsetData.getOffsetFor('seasonWeek');
    const seasonWeekBinary = utilService.dec2bin(week.weekIndex, seasonWeekOffset.length);
    this.scheduleData = utilService.replaceAt(this.scheduleData, seasonWeekOffset.offset, seasonWeekBinary);

    const weekTypeOffset = this.offsetData.getOffsetFor('weekType');
    const weekTypeBinary = utilService.dec2bin(week.scheduleId, weekTypeOffset.length);
    this.scheduleData = utilService.replaceAt(this.scheduleData, weekTypeOffset.offset, weekTypeBinary);
    this.emit('change');
  };

  get dayOfWeek () {
    return this.gameDayOfWeek;
  };

  set dayOfWeek (dayOfWeek) {
    this.gameDayOfWeek = dayOfWeek;
    const dayOfWeekOffset = this.offsetData.getOffsetFor('dayOfWeek');

    const dayOfWeekBinary = utilService.dec2bin(dayOfWeek.scheduleId, dayOfWeekOffset.length);
    this.scheduleData = utilService.replaceAt(this.scheduleData, dayOfWeekOffset.offset, dayOfWeekBinary);
    this.emit('change');
  };

  get data () {
    return this.scheduleData;
  };

  set data (data) {
    this.scheduleData = utilService.getBitArray(data);
    this.parse();
    this.emit('change');
  };

  get hexData () {
    return Buffer.from(utilService.binaryBlockToDecimalBlock(this.scheduleData));
  };

  get gameDescription () {
    return `${this.awayTeam.abbreviation} @ ${this.homeTeam.abbreviation} - ${this.dayOfWeek.name} ${this.time.format('hh:mm A')}`
  }

  parseGameTimeString(unformattedTime) {
    const minutesPastMidnight = parseInt(unformattedTime, 2);
    const formattedMilliseconds = minutesPastMidnight* 60000;
    return moment.utc(formattedMilliseconds);
  };

  byteToFormattedHexString(value) {
    let i = ("00" + value.toString(16)).substr(-2);
    return i;
  };

  formatHexString(value) {
    if (value.length % 2 !== 0) {
      value = '0' + value;
    }

    if (value.length === 2) {
      value = '00' + value;
    }

    return value;
  };

  getTeamByScheduleId(bits) {
    const id = parseInt(bits, 2);
    return teamData.teams.find((team) => { return team.scheduleId === id; });
  };

  parseGameWeek(value) {
    return parseInt(value, 2);
  };

  parseWeekType(value) {
    return parseInt(value, 2);
  };

  getWeekByIndexAndType(index, type) {
    let weekData = seasonWeekData.weeks.find((week) => {
      if (type === 0 || type === 1) {
        return week.weekIndex === index && week.scheduleId === type;
      }

      return week.weekIndex === index;
    });

    if (!weekData) {
      weekData = seasonWeekData.weeks.find((week) => { return week.abbreviation === 'N/A'; });
    }
    
    return weekData;
  };

  getDayOfWeekByScheduleId(bits) {
    const id = parseInt(bits, 2);
    return dayOfWeekData.days.find((day) => { return day.scheduleId === id; });
  };

  getGameTimeStringFormatted(formatString) {
    return this.time.format(formatString);
  };
};

module.exports = FranchiseGame;