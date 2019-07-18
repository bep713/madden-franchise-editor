const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const FranchiseFileTable2Field = require('./FranchiseFileTable2Field');

class FranchiseFileField extends EventEmitter {
  constructor(key, value, offset) {
    super();
    this._key = key;
    this._unformattedValue = value;
    this._value = parseFieldValue(value, offset);
    this._offset = offset;

    if (offset.valueInSecondTable) {
      this.secondTableField = new FranchiseFileTable2Field(value, offset.maxLength);
      this.secondTableField.on('change', function () {
        this._value = this.secondTableField.value;
        this.emit('table2-change');
      }.bind(this));
    }
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

  get isReference () {
    return this._offset.isReference;
  };

  set value (value) {
    if (this.offset.type === 'string') {
      this.secondTableField.value = value.toString();
    } else {
      this._value = value.toString();
      this._unformattedValue = parseFormattedValue(value, this._offset);
      this.emit('change');
    }
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
    case 'float':
      return utilService.bin2Float(unformatted);
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
    case 'float':
      return utilService.float2Bin(formatted);
    default:
      return formatted;
  }
};