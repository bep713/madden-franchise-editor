const FileParser = require("./FileParser");

class CASBlockParser extends FileParser {
  constructor() {
    super();

    this._onChunkStart();
  }

  _onChunkStart() {
    let chunk = {
      blocks: [],
      sizeInCas: 0,
      offset: this.currentBufferIndex,
    };

    this.bytes(8, (buf) => {
      this._onBlockStart(buf, chunk);
    });
  }

  _onBlockStart(buf, chunk) {
    let block = {
      meta: {
        size: buf.readUInt32BE(0),
        offset: this.currentBufferIndex - 8,
      },
    };

    chunk.blocks.push(block);
    const type = buf.readUInt32BE(4);

    if (type === 0xb3edf05d || type == 0x5df0edb3 || type == 0xd68e799d) {
      block.meta.type = type;
      block.meta.isCompressed = false;

      if (block.meta.size === 0x10000) {
        console.log(this.currentBufferIndex.toString(16));
      }

      this.bytes(block.meta.size - 4, (dataBuf) => {
        this._onBlockEnd(Buffer.concat([buf.slice(4), dataBuf]), block, chunk);
      });
    } else {
      block.meta.compressionIndicator = buf.readUInt16LE(4);
      block.meta.compressionType = block.meta.compressionIndicator & 0x7f;
      block.meta.compressedSize = buf.readUInt16BE(6);

      if (
        block.meta.compressionType ===
        CASBlockParser.COMPRESSION_TYPE.UNCOMPRESSED
      ) {
        if (block.meta.size > 0) {
          this.bytes(block.meta.size, (dataBuf) => {
            this._onBlockEnd(
              Buffer.concat([buf.slice(4), dataBuf]),
              block,
              chunk,
            );
          });
        }
      } else {
        block.meta.isCompressed = true;

        this.bytes(block.meta.compressedSize, (buf) => {
          return this._onBlockEnd(buf, block, chunk);
        });
      }
    }
  }

  _onBlockEnd(buf, block, chunk) {
    block.data = buf;
    this.emit("block", block);

    if (block.meta.size !== 0x10000) {
      this._onChunkEnd(chunk);
    } else {
      this.bytes(8, (buf) => {
        this._onBlockStart(buf, chunk);
      });
    }
  }

  _onChunkEnd(chunk) {
    chunk.sizeInCas = this.currentBufferIndex - chunk.offset;
    this.emit("chunk", chunk);
    this._onChunkStart();
  }
}

CASBlockParser.COMPRESSION_TYPE = {
  UNCOMPRESSED: 0,
  ZLIB: 2,
  LZ4_BLOCK: 9,
  ZSTD: 15,
  OODLE: 17,
  OODLE_2: 21,
  OODLE_3: 25,
};

module.exports = CASBlockParser;
