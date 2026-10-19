const fs = require("fs");

// Mirrors madden-franchise's getFileType/getFormat (dist/index.cjs), which is
// not exported. Reads only the first bytes and the file size, so it avoids the
// full read, decompress, schema resolve and table parse of FranchiseFile.create.
const UNCOMPRESSED_MAGIC = Buffer.from("FrTk");
const ZLIB_HEADER = Buffer.from([0x78, 0x9c]);
const FRANCHISE_MIN_UNCOMPRESSED_SIZE = 0x895440;

function formatFromHeader(header, size) {
  if (header.length < 4) return null;
  const isCompressed = !header.subarray(0, 4).equals(UNCOMPRESSED_MAGIC);
  if (isCompressed) {
    return header.subarray(0, 2).equals(ZLIB_HEADER)
      ? "franchise-common"
      : "franchise";
  }
  return size > FRANCHISE_MIN_UNCOMPRESSED_SIZE
    ? "franchise"
    : "franchise-common";
}

/**
 * @param {string} filePath
 * @returns {Promise<string|null>} "franchise" | "franchise-common", or null if unreadable
 */
async function detectFormat(filePath) {
  let handle;
  try {
    handle = await fs.promises.open(filePath, "r");
    const { size } = await handle.stat();
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, 4, 0);
    return formatFromHeader(header.subarray(0, bytesRead), size);
  } catch (err) {
    return null;
  } finally {
    if (handle) await handle.close();
  }
}

module.exports = { detectFormat, formatFromHeader };
