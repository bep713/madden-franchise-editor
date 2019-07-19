const utilService = require('../services/utilService');

class FranchiseEnumValue {
  constructor(name, index, value) {
    this._name = name;
    this._index = parseInt(index);
    this._value = parseInt(value);
    this._unformattedValue = parseFormattedValue(parseInt(value));
  };

  get name () {
    return this._name;
  };

  get index () {
    return this._index;
  };

  get value () {
    return this._value;
  };

  get unformattedValue () {
    return this._unformattedValue;
  };

  setMemberLength(length) {
    this._unformattedValue = this._unformattedValue.padStart(length, '0');
  };
};

module.exports = FranchiseEnumValue;

function parseFormattedValue(value) {
  return utilService.dec2bin(value);
};