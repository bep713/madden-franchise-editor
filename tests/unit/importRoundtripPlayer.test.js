// Bulk import regression (helpers/importRoundtrip.js). Split out of
// importRoundtrip.test.js so node --test runs it in parallel.
const test = require("node:test");
const { checkUnchangedRoundTrip } = require("./helpers/importRoundtrip");

const CASES = [{ tableId: 4220, autoUnempty: true }];

for (const { tableId, autoUnempty } of CASES) {
  test(`unchanged round trip of table ${tableId} (autoUnempty ${autoUnempty})`, () =>
    checkUnchangedRoundTrip(tableId, autoUnempty));
}
