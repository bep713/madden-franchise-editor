const fs = require('fs');
const LZ4 = require('lz4');
const utilService = require('./utilService');

let schemaGenerationService = {};

schemaGenerationService.generate = (data) => {
  let chunkIndicies = [];

  let currentIndex = 6;
  while (currentIndex <= data.length) {
    const chunkSizeHex = data.slice(currentIndex, currentIndex + 2);
    const chunkSize = utilService.byteArrayToLong(chunkSizeHex, true);

    const start = currentIndex - 6;
    chunkIndicies.push({
      'start': start,
      'end': start + (chunkSize + 8)
    });

    currentIndex += (chunkSize + 8);
  }
  
  let chunks = [];

  chunkIndicies.forEach((chunkIndex) => {
    chunks.push(data.slice(chunkIndex.start, chunkIndex.end));
  });

  let uncompressed = Buffer.alloc(0);
  chunks.forEach((chunk, idx) => {
    let formattedChunk = readChunk(chunk);
    uncompressed = Buffer.concat([uncompressed, formattedChunk]);
  });
  
  return uncompressed;
};

module.exports = schemaGenerationService;

function readChunk(chunk) {
  let data = chunk.slice(0x8);
  let uncompressedChunk = Buffer.alloc(0x20000);
  let uncompressedSize = LZ4.decodeBlock(data, uncompressedChunk);
  return uncompressedChunk.slice(0, uncompressedSize);
};