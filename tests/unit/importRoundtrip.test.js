// Bulk import regression (helpers/importRoundtrip.js). The Player table
// (4220) cases take ~9 s each, so the autoUnempty one is in
// importRoundtripPlayer.test.js, which node --test runs in parallel.
const test = require("node:test");
const { checkUnchangedRoundTrip } = require("./helpers/importRoundtrip");

const CASES = [
  { tableId: 4104, autoUnempty: false },
  { tableId: 4104, autoUnempty: true },
  { tableId: 7482, autoUnempty: false },
  { tableId: 7482, autoUnempty: true },
  { tableId: 4220, autoUnempty: false },
];

for (const { tableId, autoUnempty } of CASES) {
  test(`unchanged round trip of table ${tableId} (autoUnempty ${autoUnempty})`, () =>
    checkUnchangedRoundTrip(tableId, autoUnempty));
}
