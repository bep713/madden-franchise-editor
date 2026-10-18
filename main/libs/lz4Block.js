// Pure-JS LZ4 block decoder (https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md).
// Used to unpack the LZ4 blocks inside CAS files when searching for schemas.
//
// Strict: every input read, output write and match offset is bounds-checked.
// Malformed input returns a negative number instead of throwing or writing
// past the end of `output`.

/**
 * Decode one LZ4 block.
 * @param {Buffer|Uint8Array} input - compressed bytes
 * @param {Buffer|Uint8Array} output - destination, must be large enough
 * @param {number} [sIdx] - first input byte of the block
 * @param {number} [eIdx] - end (exclusive) of the block in input
 * @returns {number} bytes written, or a negative number -(p) on malformed
 *   input, where p is the 1-based input position where decoding failed
 */
function decodeBlock(input, output, sIdx = 0, eIdx = input.length) {
  const outLen = output.length;
  let i = sIdx;
  let j = 0;

  // An empty input is not a block. The smallest valid block is a single
  // 0x00 token (empty output).
  if (eIdx <= sIdx) {
    return -1;
  }

  while (i < eIdx) {
    const token = input[i++];

    // Literals
    let literalLength = token >> 4;
    if (literalLength === 15) {
      let b;
      do {
        if (i >= eIdx) return -(i + 1);
        b = input[i++];
        literalLength += b;
      } while (b === 255);
    }

    if (literalLength > eIdx - i) return -(i + 1);
    if (literalLength > outLen - j) return -(i + 1);
    for (const end = i + literalLength; i < end; ) {
      output[j++] = input[i++];
    }

    // The last sequence has literals only and ends the block. A zero-literal
    // token may only end the block when it is the whole block (empty output).
    if (i === eIdx) {
      if (literalLength > 0 || (eIdx - sIdx === 1 && token === 0)) {
        return j;
      }
      return -(i + 1);
    }

    // Match: 2-byte little-endian offset
    if (i + 2 > eIdx) return -(i + 1);
    const offset = input[i] | (input[i + 1] << 8);
    i += 2;
    if (offset === 0 || offset > j) return -(i - 1);

    let matchLength = token & 15;
    if (matchLength === 15) {
      let b;
      do {
        if (i >= eIdx) return -(i + 1);
        b = input[i++];
        matchLength += b;
      } while (b === 255);
    }
    matchLength += 4;

    if (matchLength > outLen - j) return -(i + 1);

    // Byte-by-byte on purpose: matches may overlap their own output.
    for (let src = j - offset, end = j + matchLength; j < end; ) {
      output[j++] = output[src++];
    }
  }

  // The input ended right after a match; the spec requires a final
  // literals-only sequence.
  return -(i + 1);
}

module.exports = { decodeBlock };
