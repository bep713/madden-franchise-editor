// detectFormat must agree with the library's own format detection.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { FranchiseFile } = require("madden-franchise");

const { detectFormat, formatFromHeader } = require("../../main/utils/detectFormat");

const DATA = path.join(__dirname, "..", "data");
const FIXTURES = [
  path.join(DATA, "m22", "career", "CAREER-M22TEST"),
  path.join(DATA, "c27", "dynasty", "DYNASTY-DYNASTY"),
].filter((p) => fs.existsSync(p));

for (const file of FIXTURES) {
  test(`matches library format for ${path.basename(file)}`, async () => {
    const expected = new FranchiseFile(file, { autoParse: false }).type.format;
    assert.equal(await detectFormat(file), expected);
  });
}

test("header branches", () => {
  const frtk = Buffer.from("FrTk");
  assert.equal(formatFromHeader(frtk, 0x895441), "franchise");
  assert.equal(formatFromHeader(frtk, 0x895440), "franchise-common");
  assert.equal(formatFromHeader(Buffer.from([0x78, 0x9c, 0, 0]), 10), "franchise-common");
  assert.equal(formatFromHeader(Buffer.from([1, 2, 3, 4]), 10), "franchise");
  assert.equal(formatFromHeader(Buffer.from([1, 2]), 10), null);
});

test("returns null for a missing file", async () => {
  assert.equal(await detectFormat(path.join(os.tmpdir(), "nope-xyz")), null);
});
