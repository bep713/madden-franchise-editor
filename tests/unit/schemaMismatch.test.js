// checkSchemaMismatch: compares a file's expected schema to the loaded one.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  checkSchemaMismatch,
} = require("../../main/handlers/schemaMismatchHandler");

const file = (expected, meta) => ({
  expectedSchemaVersion: expected,
  schemaList: meta === undefined ? undefined : { meta },
});

test("match", () => {
  const meta = { gameYear: 22, major: 328, minor: 1 };
  const r = checkSchemaMismatch(file({ major: 328, minor: 1 }, meta));
  assert.equal(r.hasMismatch, false);
  assert.deepEqual(r.used, meta);
});

test("major or minor differs", () => {
  const meta = { gameYear: 22, major: 329, minor: 1 };
  assert.equal(
    checkSchemaMismatch(file({ major: 328, minor: 1 }, meta)).hasMismatch,
    true,
  );
  assert.equal(
    checkSchemaMismatch(file({ major: 329, minor: 0 }, meta)).hasMismatch,
    true,
  );
});

test("year only counts when expected has a gameYear", () => {
  const meta = { gameYear: 22, major: 328, minor: 1 };
  assert.equal(
    checkSchemaMismatch(file({ gameYear: 23, major: 328, minor: 1 }, meta))
      .hasMismatch,
    true,
  );
  assert.equal(
    checkSchemaMismatch(file({ gameYear: 22, major: 328, minor: 1 }, meta))
      .hasMismatch,
    false,
  );
  assert.equal(
    checkSchemaMismatch(file({ major: 328, minor: 1 }, meta)).hasMismatch,
    false,
  );
});

test("null expected is not a mismatch", () => {
  const meta = { gameYear: 22, major: 328, minor: 1 };
  assert.deepEqual(checkSchemaMismatch(file(null, meta)), {
    hasMismatch: false,
    expected: null,
    used: meta,
  });
});

test("no loaded meta is a mismatch even without an expected version", () => {
  assert.deepEqual(checkSchemaMismatch(file(null, undefined)), {
    hasMismatch: true,
    expected: null,
    used: null,
  });
});

test("missing loaded meta is a mismatch", () => {
  const expected = { major: 328, minor: 1 };
  assert.deepEqual(checkSchemaMismatch(file(expected, undefined)), {
    hasMismatch: true,
    expected,
    used: null,
  });
});
