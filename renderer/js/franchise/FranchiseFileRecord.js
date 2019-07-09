const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const FranchiseFileField = require('./FranchiseFileField');

class FranchiseFileRecord extends EventEmitter {
  constructor(data, offsetTable) {
    super();
    this._data = data;
    this._offsetTable = offsetTable;
    this._fields = parseRecordFields(data, offsetTable);

    const that = this;
    this._fields.forEach((field) => {
      field.on('change', function () {
        that._data = utilService.replaceAt(that._data, this.offset.offset, this.unformattedValue);
        that.emit('change');
      });
    });
  };

  get hexData () {
    return Buffer.from(utilService.binaryBlockToDecimalBlock(this._data));
  };

  getFieldByKey(key) {
    return this._fields.find((field) => { return field.key === key; });
  };
};

module.exports = FranchiseFileRecord;

function parseRecordFields (data, offsetTable) {
  let fields = [];

  for (let j = 0; j < offsetTable.length; j++) {
    const offset = offsetTable[j];
    const unformattedValue = data.slice(offset.offset, offset.offset + offset.length);
    fields.push(new FranchiseFileField(offset.name, unformattedValue, offset));
  }

  return fields;
};