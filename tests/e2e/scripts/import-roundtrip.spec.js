const fs = require("fs");
const os = require("os");
const path = require("path");
const xlsx = require("xlsx");
const { expect } = require("chai");
const { test } = require("../util/test");
const { FranchiseFile } = require("madden-franchise");

const FilePaths = require("../util/FilePaths");
const { applyImportedRows } = require("../../../main/handlers/externalDataHandler");

// Node-level check of the bulk import logic: exporting a table and importing it
// back unchanged must not alter any record, even after saving and reopening.
const TABLE_IDS = [4104, 7482, 4220];

const snapshot = (table) =>
  table.records.map((record) => `${record.isEmpty}:${record.data.toString("hex")}`);

// Mirrors the export -> xlsx -> import path the app takes
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

for (const autoUnempty of [false, true]) {
  for (const tableId of TABLE_IDS) {
    test(`unchanged round trip of table ${tableId} (autoUnempty ${autoUnempty})`, async () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-roundtrip-"));
      const schemaDirectory = path.join(tmpDir, "schemas");
      fs.mkdirSync(schemaDirectory);
      const options = {
        schemaDirectory,
        autoUnempty,
        saveOnChange: false,
      };

      try {
        const file = await FranchiseFile.create(
          FilePaths.m22.career.pristine,
          options,
        );
        const table = file.getTableById(tableId);
        await table.readRecords();
        const before = snapshot(table);

        applyImportedRows(table, exportAndParse(table));
        expect(snapshot(table)).to.deep.equal(before);
        table.recalculateEmptyRecordReferences();

        const savedPath = path.join(tmpDir, "saved");
        await file.save(savedPath);

        const reopened = await FranchiseFile.create(savedPath, options);
        const reopenedTable = reopened.getTableById(tableId);
        await reopenedTable.readRecords();
        expect(snapshot(reopenedTable)).to.deep.equal(before);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }
}
