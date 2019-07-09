const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');

class FranchiseFileField extends EventEmitter {
  constructor(key, value, offset) {
    super();
    this._key = key;
    this._unformattedValue = value;
    this._value = parseFieldValue(value, offset);
    this._offset = offset;
  };

  get key () {
    return this._key;
  };

  get offset () {
    return this._offset;
  };

  get value () {
    return this._value;
  };

  set value (value) {
    this._value = value.toString();
    this._unformattedValue = parseFormattedValue(value, this._offset);
    this.emit('change');
  };

  get unformattedValue () {
    return this._unformattedValue;
  };

  set unformattedValue (unformattedValue) {
    this._unformattedValue = unformattedValue;
    this._value = parseFieldValue(unformattedValue, this._offset);
    this.emit('change');
  };
};

module.exports = FranchiseFileField;

function parseFieldValue(unformatted, offset) {
  switch (offset.type) {
    case 's_int':
      return utilService.bin2dec(unformatted) - (offset.maxValue + 1);
    case 'int':
      return utilService.bin2dec(unformatted);
    case 'bool':
      return unformatted[0] === '1' ? true : false;
    default:
      return unformatted;
  }
};

function parseFormattedValue(formatted, offset) {
  switch (offset.type) {
    case 's_int':
      const actualValue = parseInt(formatted);
      return utilService.dec2bin(actualValue + offset.maxValue + 1, offset.length);
    case 'int':
      return utilService.dec2bin(formatted, offset.length);
    case 'bool':
      return (formatted == 'true') ? '1' : '0';
    default:
      return formatted;
  }
};