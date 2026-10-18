// Regression tests for main/libs/lz4Block.js and its use in
// FranchiseFileManager._generateUncompressedSchema (schema search).
// fixtures/lz4/<name>.lz4 were encoded by lz4@0.6.5 (or hand-built where it
// would not compress) and <name>.bin is the original data.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { decodeBlock } = require("../../main/libs/lz4Block");
const manager = require("../../main/services/FranchiseFileManager");

const FX = path.join(__dirname, "fixtures", "lz4");

// text: ordinary matches; overlap: matches overlapping their own output;
// literals-270 / match-274: length-extension bytes.
const NAMES = ["text", "overlap", "literals-270", "match-274"];

function load(name) {
  return {
    lz4: fs.readFileSync(path.join(FX, `${name}.lz4`)),
    bin: fs.readFileSync(path.join(FX, `${name}.bin`)),
  };
}

function assertBytesEqual(actual, expected, label) {
  if (actual.equals(expected)) return;
  let i = 0;
  while (i < actual.length && actual[i] === expected[i]) i++;
  const hex = (b) => b.subarray(Math.max(0, i - 4), i + 8).toString("hex");
  assert.fail(
    `${label}: first difference at byte ${i} (lengths ${actual.length} vs ${expected.length}); ` +
      `actual ...${hex(actual)} expected ...${hex(expected)}`,
  );
}

for (const name of NAMES) {
  test(`decodes ${name}`, () => {
    const { lz4, bin } = load(name);
    // Larger than needed, to catch writes past the decoded length.
    const output = Buffer.alloc(bin.length + 16, 0xee);
    const written = decodeBlock(lz4, output);
    assert.equal(written, bin.length, "bytes written");
    assertBytesEqual(output.subarray(0, written), bin, `${name} decoded`);
    assert.ok(output.subarray(written).every((b) => b === 0xee), "wrote past the end");
  });
}

test("malformed input returns a negative number", () => {
  const text = load("text");
  const overlap = load("overlap");
  const badOffset = Buffer.from(overlap.lz4);
  badOffset.writeUInt16LE(0, 2); // first match offset -> 0
  const cases = {
    empty: [Buffer.alloc(0), 10],
    "truncated mid-block": [text.lz4.subarray(0, 1000), text.bin.length],
    "zero match offset": [badOffset, overlap.bin.length],
    "output too small": [text.lz4, text.bin.length / 2],
  };
  for (const [label, [input, size]] of Object.entries(cases)) {
    const ret = decodeBlock(input, Buffer.alloc(size));
    assert.ok(ret < 0, `${label}: expected a negative number, got ${ret}`);
  }
});

test("_generateUncompressedSchema concatenates decoded blocks", () => {
  const parts = NAMES.map(load);
  const chunk = {
    blocks: parts.map((p) => ({ meta: { size: p.bin.length }, data: p.lz4 })),
  };
  assertBytesEqual(
    manager._generateUncompressedSchema(chunk),
    Buffer.concat(parts.map((p) => p.bin)),
    "schema chunk",
  );
});

test("_generateUncompressedSchema throws on a corrupt block", () => {
  const { lz4, bin } = load("text");
  const chunk = { blocks: [{ meta: { size: bin.length }, data: lz4.subarray(0, 1000) }] };
  assert.throws(
    () => manager._generateUncompressedSchema(chunk),
    /LZ4 block decode failed/,
  );
});
