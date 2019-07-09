const EventEmitter = require('events').EventEmitter;
const utilService = require('../services/utilService');
const FranchiseFileRecord = require('./FranchiseFileRecord');

class FranchiseFileTable extends EventEmitter {
  constructor(data, offset) {
    super();
    this.data = data;
    this.offset = offset;
    this.name = readTableName(data);
    this.recordsRead = false;
  };

  set schema (schema) {
    this._schema = schema;
    
    if (schema) {
      this.header = readTableHeader(this.data, schema);
    }
  };

  get schema () {
    return this._schema;
  };

  readRecords () {
    return new Promise((resolve, reject) => {
      if (!this.recordsRead) {
        if (this.schema) {
          this.offsetTable = readOffsetTable(this.data, this.schema, this.header);
          this.records = readRecords(this.data, this.header, this.schema, this.offsetTable);
  
          this.records.forEach((record, index) => {
            const that = this;
            record.on('change', function () {
              const recordOffset = that.header.headerSize + (index * that.header.record1Size);
  
              const header = that.data.slice(0, recordOffset);
              const trailer = that.data.slice(recordOffset + that.header.record1Size);

              that.data = Buffer.concat([header, this.hexData, trailer]);
              that.emit('change');
            });
          });
  
          this.recordsRead = true;
          resolve(this);
        }
  
        reject('Cannot read records: Schema is not defined.');
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

function readTableHeader(data, schema) {
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

  let headerSize = 0xE4 + (schema.numMembers * 4) + tableStoreLength;
  let offsetStart = 0xE4 + tableStoreLength;
  const binaryData = utilService.getBitArray(data.slice(0, headerSize));
  const records1Size = utilService.bin2dec(binaryData.slice(records1SizeOffset, records1SizeOffset+9));
  const hasSecondTable = tableTotalLength > table1Length;

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
    'record1Size': records1Size,
    'offsetStart': offsetStart,
    'data2Id': data2Id,
    'table1Length2': table1Length2,
    'tableTotalLength': tableTotalLength,
    'hasSecondTable': hasSecondTable
  }

  // return {
  //   'tableId': 5102,
  //   'tablePad1': 0,
  //   'tableUnknown1': 64,
  //   'tableUnknown2': 1,
  //   'data1Id': 'SPBF',
  //   'data1Type': 95,
  //   'data1Unknown1': 7,
  //   'data1Flag1': 0,
  //   'data1Flag2': 1,
  //   'data1Flag3': 0,
  //   'data1Flag4': 0,
  //   'tableStoreLength': 0,
  //   'tableStoreName': null,
  //   'data1Offset': 64,
  //   'data1TableId': 5102,
  //   'data1RecordCount': 1,
  //   'data1Pad2': 0,
  //   'table1Length': 212,
  //   'table2Length': 0,
  //   'data1Pad3': 0,
  //   'data1Pad4': 0,
  //   'headerSize': 392,
  //   'record1Size': 16,
  //   'capacity': 0,
  //   'offsetStart': 228
  // }
};

function readOffsetTable(data, schema, header) {
  let currentIndex = header.offsetStart;
  let offsetTable = parseOffsetTableFromData();
  sortOffsetTableByIndex();

  for(let i = 0; i < offsetTable.length; i++) {
    let curOffset = offsetTable[i];
    let nextOffset = offsetTable.length > i + 1 ? offsetTable[i+1] : null;

    if (nextOffset) {
      curOffset.length = nextOffset.indexOffset - curOffset.indexOffset; 
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
      offsetLength += currentOffset.length;
      chunkedOffsets.push(currentOffset);

      currentOffsetIndex += 1;
    } while(offsetLength < 32);

    chunked32bit.push(chunkedOffsets);
  }

  chunked32bit.forEach((offsetArray) => {
    let currentOffset = offsetArray[0].indexOffset;
    offsetArray[offsetArray.length - 1].offset = currentOffset;

    for (let i = offsetArray.length - 2; i >= 0; i--) {
      let previousOffset = offsetArray[i+1];
      let offset = offsetArray[i];
      offset.offset = previousOffset.offset + previousOffset.length;
    }
  });

  offsetTable.sort((a,b) => { return a.offset - b.offset; });

  return offsetTable;

  function sortOffsetTableByIndex() {
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
        'isSigned': minValue < 0 || maxValue < 0,
        'minValue': minValue,
        'maxValue': maxValue,
        'indexOffset': utilService.byteArrayToLong(data.slice(currentIndex, currentIndex + 4), true)
      });
      currentIndex += 4;
    });

    return table;
  };
};

function readRecords(data, header, schema, offsetTable) {
  const binaryData = utilService.getBitArray(data.slice(header.headerSize, header.table1Length + header.headerSize));

  let records = [];

  for (let i = 0; i < binaryData.length; i += (header.record1Size * 8)) {
    const recordBinary = binaryData.slice(i, i + (header.record1Size * 8));
    records.push(new FranchiseFileRecord(recordBinary, offsetTable));
  }

  return records;
};