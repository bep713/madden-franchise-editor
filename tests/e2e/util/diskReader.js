const fs = require("fs");
const os = require("os");
const path = require("path");
const { FranchiseFile } = require("madden-franchise");
const { poll } = require("./poll");

// Parses a franchise file on disk in the test process, so a test can check
// what was saved without relaunching the app. Returns the same shape as
// App.readTable for these keys, or null while the file can't be parsed
// (mid-write).
async function readTableFromDisk(filePath, tableId, fields) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-disk-read-"));
  try {
    const file = await FranchiseFile.create(filePath, {
      schemaDirectory: tmpDir,
      saveOnChange: false,
    });
    const table = file.getTableById(tableId);
    await table.readRecords(fields);
    const names = fields || table.offsetTable.map((offset) => offset.name);
    return {
      records: table.records.map((record) =>
        Object.fromEntries(names.map((name) => [name, record[name]])),
      ),
      // sorted as numbers, like FranchiseFileManager._serializeEmptyRecordIndices
      emptyRecordIndices: [...table.emptyRecords.keys()]
        .map(Number)
        .sort((a, b) => a - b),
      header: { nextRecordToUse: table.header.nextRecordToUse },
    };
  } catch {
    return null;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Waits until the file on disk can be parsed, then returns the table
async function readSavedTable(
  filePath,
  tableId,
  fields,
  { timeout = 30000, message = "The saved file couldn't be read" } = {},
) {
  return poll(
    () => readTableFromDisk(filePath, tableId, fields),
    (table) => table !== null,
    { timeout, message },
  );
}

module.exports = { readTableFromDisk, readSavedTable };
