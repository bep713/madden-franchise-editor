const fs = require('fs');
const zlib = require('zlib');
const EventEmitter = require('events').EventEmitter;
const FranchiseSchedule = require('./FranchiseSchedule');

const COMPRESSED_FILE_LENGTH = 2936094;
const COMPRESSED_DATA_OFFSET = 0x52;

class FranchiseFile extends EventEmitter {
  constructor(filePath) {
    super();

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