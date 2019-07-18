const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');

class FranchiseFileTable2Field extends EventEmitter {
  constructor (index, maxLength) {
    super();
    this.rawIndex = index;
    this.index = utilService.bin2dec(index);
    this.maxLength = maxLength;
    this._unformattedValue = null;
    this._value = '';
  };

  get unformattedValue () {
    return this._unformattedValue;
  };

  set unformattedValue (value) {
    this._unformattedValue = value;
    
    let formattedValue = '';
    const chunked = utilService.chunk(this._unformattedValue, 8);
    chunked.forEach((chunk) => {
      formattedValue += String.fromCharCode(parseInt(chunk,2));
    });

    this._value = formattedValue.replace(/\0.*$/g,'');
    this.emit('change');
  };

  get value () {
    return this._value;
  };

  set value (value) {
    if (value.length > this.maxLength) {
      value = value.substring(0, this.maxLength);
    }

    this._value = value;

    let valuePadded = value;

    if (value.length < this.maxLength) {
      const numberOfNullCharactersToAdd = this.maxLength - value.length;
      
      for (let i = 0; i < numberOfNullCharactersToAdd; i++) {
        valuePadded += String.fromCharCode(0);
      }
    }

    this._unformattedValue = valuePadded.split('').map((char) => {
      return char.charCodeAt(0).toString(2).padStart(8, '0');
    }).join('');

    this.emit('change');
  };

  get hexData () {
    return Buffer.from(utilService.binaryBlockToDecimalBlock(this.unformattedValue));
  };
};

module.exports = FranchiseFileTable2Field;