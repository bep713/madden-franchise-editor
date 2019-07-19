const fs = require('fs');
const zlib = require('zlib');
const EventEmitter = require('events').EventEmitter;
const FranchiseSchema = require('./FranchiseSchema');
const FranchiseSchedule = require('./FranchiseSchedule');
const FranchiseFileTable = require('./FranchiseFileTable');

const COMPRESSED_FILE_LENGTH = 2936094;
const COMPRESSED_DATA_OFFSET = 0x52;

class FranchiseFile extends EventEmitter {
  constructor(filePath) {
    super();
    this.isLoaded = false;

    if (Array.isArray(filePath)) {
      this._filePath = filePath[0];
    } else {
      this._filePath = filePath;
    }
    
    this._rawContents = fs.readFileSync(filePath);

    if (this._rawContents.length === COMPRESSED_FILE_LENGTH) {
      this._openedFranchiseFile = true;
      this.packedFileContents = this.rawContents;
      this.unpackedFileContents = unpackFile(this.rawContents);
    } else {
      this._openedFranchiseFile = false;
      this.unpackedFileContents = this.rawContents;
    }

    this.parse();
  };

  parse() {
    this.schedule = new FranchiseSchedule(this.unpackedFileContents);
    const that = this;

    this.schedule.on('change', function (game) {
      const header = that.unpackedFileContents.slice(0, game.offset);
      const trailer = that.unpackedFileContents.slice(game.offset + game.hexData.length);

      that.unpackedFileContents = Buffer.concat([header, game.hexData, trailer]);
      that.packFile();
    });

    this.schedule.on('change-all', function (offsets) {
      const header = that.unpackedFileContents.slice(0, offsets.startingOffset);
      const trailer = that.unpackedFileContents.slice(offsets.endingOffset);

      that.unpackedFileContents = Buffer.concat([header, offsets.hexData, trailer]);
      that.packFile();
    });

    let schemaPromise = new Promise((resolve, reject) => {
      this.schemaList = new FranchiseSchema();
      this.schemaList.on('schemas:done', function () {
        resolve();
      });
    });

    let tablePromise = new Promise((resolve, reject) => {
      const firstCheck = 0x53;
      const secondCheck = 0x50;
      const thirdCheck = 0x42;
      const fourthCheck = 0x46;

      const altFirstCheck = 0x41;
      const altSecondCheck = 0x53;
      const altThirdCheck = 0x54;
      const altFourthCheck = 0x4F;

      const tableIndicies = [];

      for (let i = 0; i <= this.unpackedFileContents.length - 4; i+=1) {
        if ((this.unpackedFileContents[i] === firstCheck
          && this.unpackedFileContents[i+1] === secondCheck
          && this.unpackedFileContents[i+2] === thirdCheck
          && this.unpackedFileContents[i+3] === fourthCheck) ||
          (this.unpackedFileContents[i] === altFirstCheck
          && this.unpackedFileContents[i+1] === altSecondCheck
          && this.unpackedFileContents[i+2] === altThirdCheck
          && this.unpackedFileContents[i+3] === altFourthCheck)) {
            const tableStart = i - 0x90;
            tableIndicies.push(tableStart);
          }
      }

      this.tables = [];

      for (let i = 0; i < tableIndicies.length; i++) {
        const currentTable = tableIndicies[i];
        const nextTable = tableIndicies.length >= i+1 ? tableIndicies[i+1] : null;

        const tableData = this.unpackedFileContents.slice(currentTable, nextTable);

        const newFranchiseTable = new FranchiseFileTable(tableData, currentTable);
        this.tables.push(newFranchiseTable);

        // console.log(i, newFranchiseTable.name);

        newFranchiseTable.on('change', function () {
          const header = that.unpackedFileContents.slice(0, this.offset);
          const trailer = that.unpackedFileContents.slice(this.offset + this.data.length);

          that.unpackedFileContents = Buffer.concat([header, this.data, trailer]);
          that.packFile();
        });
      }

      resolve();
    });

    Promise.all([schemaPromise, tablePromise]).then(() => {
      that.tables.forEach((table) => {
        const schema = that.schemaList.getSchema(table.name);

        if (schema) {
          table.schema = that.schemaList.getSchema(table.name);
        }
      });

      that.isLoaded = true;
      that.emit('tables-done');
    });
  };

  packFile(outputFilePath) {
    this.emit('saving');
    let destination = outputFilePath ? outputFilePath : this.filePath;

    if (this.openedFranchiseFile) {
      const that = this;
      packFile(this.packedFileContents, this.unpackedFileContents).then((data) => { 
        save(destination, data);
        that.emit('saved');
      });
    }
    else {
      // ask where to save file
    }
  };

  get rawContents () {
    return this._rawContents;
  };

  get openedFranchiseFile () {
    return this._openedFranchiseFile;
  };

  get filePath () {
    return this._filePath;
  };

  get schema () {
    return this.schemaList;
  };

  getTableByName (name) {
    return this.tables.find((table) => { return table.name === name; });
  };

  getAllTablesByName (name) {
    return this.tables.filter((table) => { return table.name === name; });
  };

  getTableById (id) {
    return this.tables.find((table) => { return table.header && table.header.tableId === id; });
  };

  getTableByIndex (index) {
    return this.tables[index];
  };
};

module.exports = FranchiseFile;

function unpackFile (fileData) {
  return zlib.inflateSync(fileData.slice(COMPRESSED_DATA_OFFSET));
};

function packFile (originalData, data) {
  return new Promise((resolve, reject) => {
    zlib.deflate(data, {
      windowBits: 15
    }, function (err, newData) {
      if (err) reject(err);

      const header = originalData.slice(0, COMPRESSED_DATA_OFFSET);
      const endOfData = (newData.length).toString(16);
      header[0x4A] = parseInt(endOfData.substr(4), 16);
      header[0x4B] = parseInt(endOfData.substr(2, 2), 16);
      header[0x4C] = parseInt(endOfData.substr(0, 2), 16);
    
      const trailer = originalData.slice(newData.length + COMPRESSED_DATA_OFFSET);
      resolve(Buffer.concat([header, newData, trailer]));
    });
  });
};

function save (destination, packedContents) {
  fs.writeFile(destination, packedContents, (err) => {
    if (err) throw err;
  });
};