const moment = require('moment');
const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const dayOfWeekData = require('../../../data/dayOfWeekData.json');

class FranchiseGame extends EventEmitter {
  constructor (game, index) {
    super();
    this.gameRecord = game;
    this._awayTeam = null;
    this._homeTeam = null;
    this._dayOfWeek = dayOfWeekData.days.find((day) => { return day.name === game.DayOfWeek; });
    this._time = parseGameTimeString(game.TimeOfDay);
    this.index = index;
    this.offset = index;
    this._appointment = null;

    // Initially set isEditable to false.
    // If there is an appointment, we will set it to true.
    this._isEditable = false;
  };

  set awayTeam (metadata) {
    this._awayTeam = metadata;
    this.gameRecord.AwayTeam = this.gameRecord.AwayTeam.substring(0, 16) + utilService.dec2bin(metadata.referenceIndex, 16);
    this.emit('change');
  };

  get awayTeam () {
    return this._awayTeam;
  };

  set homeTeam (metadata) {
    this._homeTeam = metadata;
    this.gameRecord.HomeTeam = this.gameRecord.HomeTeam.substring(0, 16) + utilService.dec2bin(metadata.referenceIndex, 16);
    this.emit('change');
  };

  get homeTeam () {
    return this._homeTeam;
  };

  get dayOfWeek () {
    return this._dayOfWeek;
  };

  set dayOfWeek (metadata) {
    this._dayOfWeek = metadata;
    this.gameRecord.DayOfWeek = metadata.name;
    this.emit('change');
  };

  get time () {
    return this._time;
  };

  set time (time) {
    const hours = time.hours();
    const minutes = time.minutes();
    const totalMinutes = hours * 60 + minutes;

    this._time = time;
    this.gameRecord.TimeOfDay = totalMinutes;
    this.emit('change');
  };

  get seasonWeek () {
    return this.gameRecord.SeasonWeek;
  };

  set seasonWeek (weekMetadata) {
    this.gameRecord.SeasonWeek = weekMetadata.weekIndex;
  };

  get seasonWeekType () {
    return this.gameRecord.SeasonWeekType;
  };

  set seasonWeekType (weekMetadata) {
    this.gameRecord.SeasonWeekType = weekMetadata.seasonWeekType;
  };

  get seasonGameNum () {
    return this.gameRecord.SeasonGameNum;
  };

  set seasonGameNum (num) {
    this.gameRecord.SeasonGameNum = num;
  };

  get appointment () {
    return this._appointment;
  };

  set appointment (appointment) {
    this._appointment = appointment;

    if (appointment && appointment.StartOccurrenceTime > 0) {
      this._isEditable = true;
    }
  };

  get epochTime () {
    return this._epochTime;
  };

  set epochTime (time) {
    this._epochTime = time;
    
    if (this._appointment && this._appointment.StartOccurrenceTime > 0) {
      this._appointment.StartOccurrenceTime = time;
    }
  };
}

function parseGameTimeString(unformattedTime) {
  const formattedMilliseconds = unformattedTime * 60000;
  return moment.utc(formattedMilliseconds);
};

module.exports = FranchiseGame;