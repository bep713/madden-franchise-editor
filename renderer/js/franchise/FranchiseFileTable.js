const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const FranchiseFileRecord = require('./FranchiseFileRecord');

class FranchiseFileTable extends EventEmitter {
  constructor(data, offset, gameYear) {
    super();
    this.data = data;
    this.offset = offset;
    this.name = readTableName(data, gameYear);
    this.recordsRead = false;
    this.isArray = this.name.indexOf('[]') >= 0;
    this._gameYear = gameYear;
    this.header = readTableHeader(this.data, this.isArray, gameYear);
  };

  set schema (schema) {
    this._schema = schema;

    let headerSize = 0;
    let records1Size = 0;
    let records1SizeOffset = this.header.record1SizeOffset + this.header.tableStoreLength * 8;

    if (schema) {
      headerSize = getHeaderOffsetByGameYear(this._gameYear) + (schema.numMembers * 4) + this.header.tableStoreLength;
      let record1SizeOffsetLength = getRecordSizeOffsetLength(this._gameYear);
      const binaryData = utilService.getBitArray(this.data.slice(0, headerSize));
      records1Size = utilService.bin2dec(binaryData.slice(records1SizeOffset, records1SizeOffset + record1SizeOffsetLength));
    }

    this.header.headerSize = headerSize;
    this.header.record1Size = records1Size;
    this.header.table1StartIndex = headerSize,
    this.header.table2StartIndex = headerSize + (this.header.data1RecordCount * records1Size);
  };

  get schema () {
    return this._schema;
  };

  readRecords () {
    return new Promise((resolve, reject) => {
      if (!this.recordsRead) {
        if (this.schema) {
          this.offsetTable = readOffsetTable(this.data, this.schema, this.header);
        } else if (this.isArray) {
          const numberOfFields = this.header.record1Size / 4;
          let offsetTable = [];

          for (let i = 0; i < numberOfFields; i++) {
            const offset = {
              'final': false,
              'index': i,
              'indexOffset': i * 32,
              'isSigned': false,
              'length': 32,
              'maxLength': null,
              'maxValue': null,
              'minValue': null,
              'name': `${this.name.substring(0, this.name.length - 2)}${i}`,
              'offset': i * 32,
              'type': this.name.substring(0, this.name.length - 2),
              'valueInSecondTable': false,
              'isReference': true
            }

            offsetTable.push(offset);
          }

          this.offsetTable = offsetTable;
        } else {
          reject('Cannot read records: Schema is not defined.');
        }

        this.records = readRecords(this.data, this.header, this.offsetTable);

        if (this.header.hasSecondTable) {
          parseTable2Values(this.data, this.header, this.records);
        }

        this.records.forEach((record, index) => {
          const that = this;
          record.on('change', function () {
            const recordOffset = that.header.headerSize + (index * that.header.record1Size);

            const header = that.data.slice(0, recordOffset);
            const trailer = that.data.slice(recordOffset + that.header.record1Size);

            that.data = Buffer.concat([header, this.hexData, trailer]);
            that.emit('change');
          });

          record.on('table2-change', function (secondTableField) {
            const header = that.data.slice(0, that.header.table2StartIndex + secondTableField.index);
            const trailer = that.data.slice(that.header.table2StartIndex + secondTableField.index + secondTableField.maxLength);

            that.data = Buffer.concat([header, secondTableField.hexData, trailer]);
            that.emit('change');
          });
        });

        this.recordsRead = true;
        resolve(this);
      } else {
        resolve(this);
      }
    });
  };
};

module.exports = FranchiseFileTable;

function readTableName (data) {
  let name = '';

  let i = 0;

  do {
    name += String.fromCharCode(data[i]);
    i += 1;
  }
  while (i < data.length && data[i] !== 0);

  return name;
};

function readTableHeader(data, isArray, gameYear) {
  switch (gameYear) {
    default:
    case 19:
      return readTableHeader19(data, isArray);
    case 20:
      return readTableHeader20(data, isArray);
  }

  function readTableHeader19 (data, isArray) {
    const headerStart = 0x80;
    const tableId = utilService.byteArrayToLong(data.slice(headerStart, headerStart+4), true);
    const tablePad1 = utilService.byteArrayToLong(data.slice(headerStart+4, headerStart+8), true);
    const tableUnknown1 = utilService.byteArrayToLong(data.slice(headerStart+8, headerStart+12), true);
    const tableUnknown2 = utilService.byteArrayToLong(data.slice(headerStart+12, headerStart+16), true);
    const data1Id = readTableName(data.slice(headerStart+16, headerStart+20));
    const data1Type = utilService.byteArrayToLong(data.slice(headerStart+20, headerStart+24), true);
    const data1Unknown1 = utilService.byteArrayToLong(data.slice(headerStart+24, headerStart+28), true);
    const data1Flag1 = data[headerStart+28];
    const data1Flag2 = data[headerStart+29];
    const data1Flag3 = data[headerStart+30];
    const data1Flag4 = data[headerStart+31];
    const tableStoreLength = utilService.byteArrayToLong(data.slice(headerStart+32, headerStart+36), true);

    let headerOffset = headerStart+36;
    let records1SizeOffset = 1689;
    let tableStoreName = null;

    if (tableStoreLength > 0) {
      headerOffset += tableStoreLength;
      records1SizeOffset += tableStoreLength * 8;
      tableStoreName = readTableName(data.slice(headerStart+36, headerStart+36+tableStoreLength));
    }

    const data1Offset = utilService.byteArrayToLong(data.slice(headerOffset, headerOffset+4), true);
    const data1TableId = utilService.byteArrayToLong(data.slice(headerOffset+4, headerOffset+8), true);
    const data1RecordCount = utilService.byteArrayToLong(data.slice(headerOffset+8, headerOffset+12), true);
    const data1Pad2 = utilService.byteArrayToLong(data.slice(headerOffset+12, headerOffset+16), true);
    const table1Length = utilService.byteArrayToLong(data.slice(headerOffset+16, headerOffset+20), true);
    const table2Length = utilService.byteArrayToLong(data.slice(headerOffset+20, headerOffset+24), true);
    const data1Pad3 = utilService.byteArrayToLong(data.slice(headerOffset+24, headerOffset+28), true);
    const data1Pad4 = utilService.byteArrayToLong(data.slice(headerOffset+28, headerOffset+32), true);
    const data2Id = readTableName(data.slice(headerOffset+32, headerOffset+36));
    const table1Length2 = utilService.byteArrayToLong(data.slice(headerOffset+36, headerOffset+40), true);
    const tableTotalLength = utilService.byteArrayToLong(data.slice(headerOffset+40, headerOffset+44), true);

    let offsetStart = 0xE4 + tableStoreLength;
    const hasSecondTable = tableTotalLength > table1Length;

    let headerSize = 0;
    let records1Size = 0;

    if (isArray) {
      headerSize = 0xE8 + tableStoreLength;
      const binaryData = utilService.getBitArray(data.slice(0, headerSize));
      records1Size = utilService.bin2dec(binaryData.slice(records1SizeOffset, records1SizeOffset+9));
    }

    return {
      'tableId': tableId,
      'tablePad1': tablePad1,
      'tableUnknown1': tableUnknown1,
      'tableUnknown2': tableUnknown2,
      'data1Id': data1Id,
      'data1Type': data1Type,
      'data1Unknown1': data1Unknown1,
      'data1Flag1': data1Flag1,
      'data1Flag2': data1Flag2,
      'data1Flag3': data1Flag3,
      'data1Flag4': data1Flag4,
      'tableStoreLength': tableStoreLength,
      'tableStoreName': tableStoreName,
      'data1Offset': data1Offset,
      'data1TableId': data1TableId,
      'data1RecordCount': data1RecordCount,
      'data1Pad2': data1Pad2,
      'table1Length': table1Length,
      'table2Length': table2Length,
      'data1Pad3': data1Pad3,
      'data1Pad4': data1Pad4,
      'headerSize': headerSize,
      'record1SizeOffset': records1SizeOffset,
      'record1Size': records1Size,
      'offsetStart': offsetStart,
      'data2Id': data2Id,
      'table1Length2': table1Length2,
      'tableTotalLength': tableTotalLength,
      'hasSecondTable': hasSecondTable,
      'table1StartIndex': tableStoreLength === 0 ? headerSize : headerSize - 4 + (data1RecordCount * 4),
      'table2StartIndex': tableStoreLength === 0 ? headerSize + (data1RecordCount * records1Size) : (headerSize -4 + (data1RecordCount * 4)) + (data1RecordCount * records1Size)
    };
  };

  function readTableHeader20 (data, isArray) {
    const headerStart = 0x80;
    const tableId = utilService.byteArrayToLong(data.slice(headerStart, headerStart+4), true);
    const tablePad1 = utilService.byteArrayToLong(data.slice(headerStart+4, headerStart+8), true);
    const tableUnknown1 = utilService.byteArrayToLong(data.slice(headerStart+8, headerStart+12), true);
    const tableUnknown2 = utilService.byteArrayToLong(data.slice(headerStart+12, headerStart+16), true);
    const tableUnknown3 = utilService.byteArrayToLong(data.slice(headerStart+16, headerStart+20), true);
    const data1Id = readTableName(data.slice(headerStart+20, headerStart+24));
    const data1Type = utilService.byteArrayToLong(data.slice(headerStart+24, headerStart+28), true);
    const data1Unknown1 = utilService.byteArrayToLong(data.slice(headerStart+28, headerStart+32), true);
    const data1Flag1 = data[headerStart+32];
    const data1Flag2 = data[headerStart+33];
    const data1Flag3 = data[headerStart+34];
    const data1Flag4 = data[headerStart+35];
    const tableStoreLength = utilService.byteArrayToLong(data.slice(headerStart+36, headerStart+40), true);

    let headerOffset = headerStart+40;
    let records1SizeOffset = 1720;
    let tableStoreName = null;

    if (tableStoreLength > 0) {
      headerOffset += tableStoreLength;
      records1SizeOffset += tableStoreLength * 8;
      tableStoreName = readTableName(data.slice(headerStart+40, headerStart+40+tableStoreLength));
    }

    const data1Offset = utilService.byteArrayToLong(data.slice(headerOffset, headerOffset+4), true);
    const data1TableId = utilService.byteArrayToLong(data.slice(headerOffset+4, headerOffset+8), true);
    const data1RecordCount = utilService.byteArrayToLong(data.slice(headerOffset+8, headerOffset+12), true);
    const data1Pad2 = utilService.byteArrayToLong(data.slice(headerOffset+12, headerOffset+16), true);
    const table1Length = utilService.byteArrayToLong(data.slice(headerOffset+16, headerOffset+20), true);
    const table2Length = utilService.byteArrayToLong(data.slice(headerOffset+20, headerOffset+24), true);
    const data1Pad3 = utilService.byteArrayToLong(data.slice(headerOffset+24, headerOffset+28), true);
    const data1Pad4 = utilService.byteArrayToLong(data.slice(headerOffset+28, headerOffset+32), true);
    const data2Id = readTableName(data.slice(headerOffset+32, headerOffset+36));
    const table1Length2 = utilService.byteArrayToLong(data.slice(headerOffset+36, headerOffset+40), true);
    const tableTotalLength = utilService.byteArrayToLong(data.slice(headerOffset+40, headerOffset+44), true);

    let offsetStart = 0xE8 + tableStoreLength;
    const hasSecondTable = tableTotalLength > table1Length;

    let headerSize = 0;
    let records1Size = 0;

    if (isArray) {
      headerSize = 0xE8 + tableStoreLength;
      const binaryData = utilService.getBitArray(data.slice(0, headerSize));
      records1Size = utilService.bin2dec(binaryData.slice(records1SizeOffset, records1SizeOffset+10));
    }

    return {
      'tableId': tableId,
      'tablePad1': tablePad1,
      'tableUnknown1': tableUnknown1,
      'tableUnknown2': tableUnknown2,
      'data1Id': data1Id,
      'data1Type': data1Type,
      'data1Unknown1': data1Unknown1,
      'data1Flag1': data1Flag1,
      'data1Flag2': data1Flag2,
      'data1Flag3': data1Flag3,
      'data1Flag4': data1Flag4,
      'tableStoreLength': tableStoreLength,
      'tableStoreName': tableStoreName,
      'data1Offset': data1Offset,
      'data1TableId': data1TableId,
      'data1RecordCount': data1RecordCount,
      'data1Pad2': data1Pad2,
      'table1Length': table1Length,
      'table2Length': table2Length,
      'data1Pad3': data1Pad3,
      'data1Pad4': data1Pad4,
      'headerSize': headerSize,
      'record1SizeOffset': records1SizeOffset,
      'record1Size': records1Size,
      'offsetStart': offsetStart,
      'data2Id': data2Id,
      'table1Length2': table1Length2,
      'tableTotalLength': tableTotalLength,
      'hasSecondTable': hasSecondTable,
      'table1StartIndex': tableStoreLength === 0 ? headerSize : headerSize - 4 + (data1RecordCount * 4),
      'table2StartIndex': tableStoreLength === 0 ? headerSize + (data1RecordCount * records1Size) : (headerSize -4 + (data1RecordCount * 4)) + (data1RecordCount * records1Size)
    };
  };
};

function readOffsetTable(data, schema, header) {
  let currentIndex = header.offsetStart;
  let offsetTable = parseOffsetTableFromData();
  // console.log(offsetTable.sort((a,b) => { return a.indexOffset - b.indexOffset}))
  sortOffsetTableByIndexOffset();

  for(let i = 0; i < offsetTable.length; i++) {
    let curOffset = offsetTable[i];
    let nextOffset = offsetTable.length > i + 1 ? offsetTable[i+1] : null;

    if (nextOffset) {
      let curIndex = i+2;
      while(nextOffset && nextOffset.final) {
        nextOffset = offsetTable[curIndex];
        curIndex += 1;
      }

      if (nextOffset) {
        curOffset.length = nextOffset.indexOffset - curOffset.indexOffset;  
      } else {
        curOffset.length = (header.record1Size * 8) - curOffset.indexOffset;
      }      
    }
    else {
      curOffset.length = (header.record1Size * 8) - curOffset.indexOffset;
    }
  }

  let currentOffsetIndex = 0;
  let chunked32bit = [];
 
  for (let i = 0; i < header.record1Size * 8; i += 32) {
    let chunkedOffsets = [];
    let offsetLength = i % 32;

    do {
      const currentOffset = offsetTable[currentOffsetIndex];

      if (currentOffset) {
        if (currentOffset.final) {
          currentOffsetIndex += 1;
          continue;
        }
        
        offsetLength += currentOffset.length;
        chunkedOffsets.push(currentOffset);
  
        currentOffsetIndex += 1;
      } else {
        break;
      }
    } while((currentOffsetIndex < offsetTable.length) && offsetLength < 32);

    chunked32bit.push(chunkedOffsets);
  }

  chunked32bit.forEach((offsetArray) => {
    if (offsetArray.length > 0) {
      let currentOffset = offsetArray[0].indexOffset;
      offsetArray[offsetArray.length - 1].offset = currentOffset;

      for (let i = offsetArray.length - 2; i >= 0; i--) {
        let previousOffset = offsetArray[i+1];
        let offset = offsetArray[i];
        offset.offset = previousOffset.offset + previousOffset.length;
      }
    }
  });

  offsetTable = offsetTable.filter((offset) => { return !offset.final; });
  offsetTable.sort((a,b) => { return a.offset - b.offset; });

  return offsetTable;

  function sortOffsetTableByIndexOffset() {
    offsetTable.sort((a, b) => { return a.indexOffset - b.indexOffset; });
  };

  function parseOffsetTableFromData() {
    let table = [];

    schema.attributes.forEach((attribute) => {
      const minValue = parseInt(attribute.minValue);
      const maxValue = parseInt(attribute.maxValue);

      table.push({
        'index': parseInt(attribute.index),
        'name': attribute.name,
        'type': (minValue < 0 || maxValue < 0) ? 's_' + attribute.type : attribute.type,
        'isReference': !attribute.enum && (attribute.type[0] == attribute.type[0].toUpperCase()) ? true : false,
        'valueInSecondTable': header.hasSecondTable && attribute.type === 'string',
        'isSigned': minValue < 0 || maxValue < 0,
        'minValue': minValue,
        'maxValue': maxValue,
        'maxLength': attribute.maxLength ? parseInt(attribute.maxLength) : null,
        'final': attribute.final === 'true' ? true : false,
        'indexOffset': utilService.byteArrayToLong(data.slice(currentIndex, currentIndex + 4), true),
        'enum': attribute.enum
      });
      currentIndex += 4;
    });

    return table;
  };
};

function readRecords(data, header, offsetTable) {
  const binaryData = utilService.getBitArray(data.slice(header.table1StartIndex, header.table2StartIndex));

  let records = [];

  for (let i = 0; i < binaryData.length; i += (header.record1Size * 8)) {
    const recordBinary = binaryData.slice(i, i + (header.record1Size * 8));
    records.push(new FranchiseFileRecord(recordBinary, offsetTable));
  }

  return records;
};

function parseTable2Values(data, header, records) {
  const secondTableBinaryData = utilService.getBitArray(data.slice(header.table2StartIndex));

  records.forEach((record) => {
    const fieldsReferencingSecondTable = record._fields.filter((field) => { return field.secondTableField; });

    fieldsReferencingSecondTable.forEach((field) => {
      const stringStartBinaryIndex = field.secondTableField.index * 8;
      const stringEndBinaryIndex = stringStartBinaryIndex + (field.offset.maxLength * 8);
      field.secondTableField.unformattedValue = secondTableBinaryData.slice(stringStartBinaryIndex, stringEndBinaryIndex);
    });
  });
};

function getHeaderOffsetByGameYear(year) {
  switch(year) {
    case 20:
      return 0xE8;
    case 19:
    default:
      return 0xE4;
  };
};

function getRecordSizeOffsetLength(year) {
  switch(year) {
    case 20:
      return 10;
    case 19:
    default:
      return 9;
  }
};