// Shared by the importRoundtrip*.test.js files. Exporting a table and
// importing it back unchanged must not alter any record, even after saving
// and reopening. Mirrors the export -> xlsx -> import path the app takes.
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const xlsx = require("xlsx");
const { FranchiseFile } = require("madden-franchise");

const { applyImportedRows } = require("../../../main/handlers/externalDataHandler");

const PRISTINE_CAREER = path.join(
  __dirname,
  "..",
  "..",
  "data",
  "m22",
  "career",
  "CAREER-M22TEST",
);

const snapshot = (table) =>
  table.records.map((record) => `${record.isEmpty}:${record.data.toString("hex")}`);

const exportAndParse = (table) => {
  const headers = table.offsetTable.map((offset) => offset.name);
  const data = table.records.map((record) =>
    headers.map((header) => record[header] ?? ""),
  );
  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet([headers, ...data], { skipHeader: true });
  xlsx.utils.book_append_sheet(wb, ws);
  const buffer = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  const parsed = xlsx.read(buffer, { type: "buffer" });
  return xlsx.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], {
    raw: false,
  });
};

async function checkUnchangedRoundTrip(tableId, autoUnempty) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-roundtrip-"));
  const schemaDirectory = path.join(tmpDir, "schemas");
  fs.mkdirSync(schemaDirectory);
  const options = {
    schemaDirectory,
    autoUnempty,
    saveOnChange: false,
  };

  try {
    const file = await FranchiseFile.create(PRISTINE_CAREER, options);
    const table = file.getTableById(tableId);
    await table.readRecords();
    const before = snapshot(table);

    applyImportedRows(table, exportAndParse(table));
    assert.deepEqual(snapshot(table), before);
    table.recalculateEmptyRecordReferences();

    const savedPath = path.join(tmpDir, "saved");
    await file.save(savedPath);

    const reopened = await FranchiseFile.create(savedPath, options);
    const reopenedTable = reopened.getTableById(tableId);
    await reopenedTable.readRecords();
    assert.deepEqual(snapshot(reopenedTable), before);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

module.exports = { checkUnchangedRoundTrip };
