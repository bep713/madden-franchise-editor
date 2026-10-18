// Regression tests for table import/export (external-data:import/export) and
// applyImportedRows. fixtures/xlsx/export.csv and export.xlsx.json are the
// output of the original xlsx 0.17.5 code path; only change them on purpose.
require("./helpers/electronStub");
const { fakeLoggedIpc } = require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  registerExternalDataHandlers,
  applyImportedRows,
} = require("../../main/handlers/externalDataHandler");

const FX = path.join(__dirname, "fixtures", "xlsx");
const ipc = fakeLoggedIpc();
registerExternalDataHandlers(ipc, { activeFiles: new Map() });
const importFile = (file) => ipc.invoke("external-data:import", file);
const exportFile = (file, headers, rows) =>
  ipc.invoke("external-data:export", file, headers, rows);

let tmp;
test.before(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "xlsx-test-"));
});
test.after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Strings, numbers, booleans, empties, unicode, CSV-special characters and a
// row wider than the headers.
function dataset() {
  const headers = [];
  for (let i = 0; i < 12; i++) headers.push(`col${i}`);
  const row = (...vals) => {
    const out = vals.slice();
    while (out.length < headers.length) out.push(`pad${out.length}`);
    return out;
  };
  const wide = [];
  for (let i = 0; i < 30; i++) wide.push(i % 3 === 0 ? i : `w${i}`);

  const rows = [
    row("plain", "007", 0, 42, -17, 0.1, 1e-7, 123456789.123, true, false, "", null),
    row("undef", undefined, -0.5, 1e21, 1234567890123456, -1e-7, 3.14159265358979, 0.30000000000000004, true, "TRUE", "false", " padded "),
    row("unicode é", "日本語", "emoji 😀🎉", "ñ", "Ωmega", "", "tab\there", "x", 1, 2, 3, 4),
    row('comma, inside', 'quote "inside"', "line1\nline2", "crlf\r\nmix", '"', ",", "\n", 'a,"b"\nc', "=1+1", "+5", "-5", "@x"),
    row("numeric-looking", "1e3", "0x10", "1,000", "12.50", "00012", "NaN", "Infinity", "1/2", "2024-01-31", "12:30", "$5"),
    row(Number.MAX_SAFE_INTEGER, -2147483648, 4294967295, 1.5e300, 5e-324, 100, 1e5, 1e6, 0.000001, 123456.789, 99999999999, 0.5),
    wide,
  ];
  return { headers, rows };
}

function assertBytesEqual(actual, expected, label) {
  if (actual.equals(expected)) return;
  let i = 0;
  while (i < actual.length && actual[i] === expected[i]) i++;
  const around = (buf) =>
    JSON.stringify(buf.subarray(Math.max(0, i - 20), i + 20).toString("utf8"));
  assert.fail(
    `${label}: bytes differ at offset ${i} (actual length ${actual.length}, ` +
      `expected ${expected.length}).\n  actual:   ${around(actual)}\n  expected: ${around(expected)}`,
  );
}

test("csv export matches golden bytes", async () => {
  const { headers, rows } = dataset();
  const out = path.join(tmp, "export.csv");
  await exportFile(out, headers, rows);
  assertBytesEqual(
    fs.readFileSync(out),
    fs.readFileSync(path.join(FX, "export.csv")),
    "export.csv",
  );
});

test("xlsx export re-imports to golden rows", async () => {
  const { headers, rows } = dataset();
  const out = path.join(tmp, "export.xlsx");
  await exportFile(out, headers, rows);
  assert.deepStrictEqual(
    await importFile(out),
    JSON.parse(fs.readFileSync(path.join(FX, "export.xlsx.json"), "utf8")),
  );
});

const SIMPLE_ROWS = [
  { a: "1", b: "two", c: "3.5" },
  { a: "4", b: "five", c: "6" },
];

for (const [name, bytes, expected] of [
  ["plain", Buffer.from("a,b,c\n1,two,3.5\n4,five,6\n"), SIMPLE_ROWS],
  ["crlf", Buffer.from("a,b,c\r\n1,two,3.5\r\n4,five,6\r\n"), SIMPLE_ROWS],
  [
    "utf-8 bom",
    Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from("a,b,c\n1,two,3.5\n4,five,6\n"),
    ]),
    SIMPLE_ROWS,
  ],
  [
    "quoted fields",
    Buffer.from(
      'a,b,c\n"x, y","he said ""hi""","line1\nline2"\n"","plain","trail,"\n',
    ),
    [
      { a: "x, y", b: 'he said "hi"', c: "line1\nline2" },
      { b: "plain", c: "trail," },
    ],
  ],
  [
    "booleans stay text",
    Buffer.from("a,b,c\nTRUE,FALSE,true\nfalse,True,yes\n"),
    [
      { a: "TRUE", b: "FALSE", c: "true" },
      { a: "false", b: "True", c: "yes" },
    ],
  ],
]) {
  test(`csv import: ${name}`, async () => {
    const file = path.join(tmp, `import-${name.replace(/\W+/g, "-")}.csv`);
    fs.writeFileSync(file, bytes);
    assert.deepStrictEqual(await importFile(file), expected);
  });
}

// ---- applyImportedRows ----

/** Fake table whose record field writes are logged as "index.field=value". */
function fakeTable(recordData) {
  const writes = [];
  const records = recordData.map(
    (data, index) =>
      new Proxy(
        { ...data },
        {
          set(target, key, value) {
            writes.push(`${index}.${String(key)}=${JSON.stringify(value)}`);
            target[key] = value;
            return true;
          },
        },
      ),
  );
  const offsetTable = [
    { name: "head", indexOffset: 0 },
    { name: "edge", indexOffset: 31 },
    { name: "body", indexOffset: 32 },
  ];
  return { table: { offsetTable, records }, writes };
}

test("applyImportedRows: unchanged values are not rewritten", () => {
  const { table, writes } = fakeTable([
    { isEmpty: false, head: true, edge: 0.1, body: "" },
    { isEmpty: false, head: null, edge: 1000000, body: "same" },
  ]);
  applyImportedRows(table, [
    // TRUE/FALSE text vs booleans, floats within tolerance, "" vs empty.
    { head: "TRUE", edge: "0.1000001", body: "" },
    { head: "", edge: "1000000.5", body: "same" },
  ]);
  assert.deepStrictEqual(writes, []);
});

test("applyImportedRows: changed values are written", () => {
  const { table, writes } = fakeTable([
    { isEmpty: false, head: true, edge: 0.1, body: "ABC" },
  ]);
  applyImportedRows(table, [{ head: "false", edge: "0.100002", body: "abc" }]);
  assert.deepStrictEqual(writes, [
    '0.head="false"',
    '0.edge="0.100002"',
    '0.body="abc"',
  ]);
});

test("applyImportedRows: empty records skip fields in their first 4 bytes", () => {
  const { table, writes } = fakeTable([
    { isEmpty: true, head: "", edge: "", body: "" },
    { isEmpty: false, head: "", edge: "", body: "" },
  ]);
  applyImportedRows(table, [
    { head: "a", edge: "b", body: "c" },
    { head: "a", edge: "b", body: "c" },
  ]);
  assert.deepStrictEqual(writes, [
    '0.body="c"',
    '1.head="a"',
    '1.edge="b"',
    '1.body="c"',
  ]);
});

test("applyImportedRows: rows beyond the record count are ignored", () => {
  const { table, writes } = fakeTable([
    { isEmpty: false, head: "", edge: "", body: "" },
  ]);
  applyImportedRows(table, [
    { head: "a", edge: "", body: "" },
    { head: "ignored", edge: "ignored", body: "ignored" },
  ]);
  assert.deepStrictEqual(writes, ['0.head="a"']);
});
