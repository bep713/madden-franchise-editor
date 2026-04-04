const stream = require("stream");
const Parser = require("stream-parser");

class FileParser extends stream.Writable {
  constructor() {
    super();
    Parser(this);

    this._file = null;
    this._currentBufferIndex = 0;
  }

  get file() {
    return this._file;
  }

  set file(file) {
    this._file = file;
  }

  get currentBufferIndex() {
    return this._currentBufferIndex;
  }

  bytes(bytesToRead, callback) {
    this._currentBufferIndex += bytesToRead;
    this._bytes(bytesToRead, callback);
  }

  skipBytes(bytesToSkip, callback) {
    this._currentBufferIndex += bytesToSkip;
    this._skipBytes(bytesToSkip, callback);
  }
}

module.exports = FileParser;
