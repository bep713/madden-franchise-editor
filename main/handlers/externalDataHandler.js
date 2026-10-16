const xlsx = require("xlsx");
const fs = require("fs");

const FLOAT_TOLERANCE = 1e-6;

function normalizeCell(value) {
  return value === null || value === undefined ? "" : String(value);
}

// Spreadsheet cells come back as strings, and empty records export as "", so a
// strict compare would rewrite (and un-empty) rows that did not change.
function cellsMatch(current, imported) {
  if (normalizeCell(current) === normalizeCell(imported)) return true;

  // Booleans come back as "TRUE"/"FALSE". Strings stay case-sensitive so
  // case-only edits are still imported.
  if (typeof current === "boolean") {
    return String(current) === normalizeCell(imported).toLowerCase();
  }

  if (typeof current === "number" && imported !== "" && imported !== null) {
    const importedNumber = Number(imported);
    return (
      Number.isFinite(importedNumber) &&
      Math.abs(current - importedNumber) <=
        FLOAT_TOLERANCE * Math.max(1, Math.abs(current))
    );
  }

  return false;
}

/**
 * Writes imported rows onto a table's existing records. Empty records skip the
 * fields in their first 4 bytes, which hold the empty-record chain pointer that
 * the library maintains itself.
 * @param {FranchiseFileTable} table
 * @param {Object[]} rows
 */
function applyImportedRows(table, rows) {
  const firstFourByteFields = new Set(
    table.offsetTable
      .filter((offset) => offset.indexOffset < 32)
      .map((offset) => offset.name),
  );

  const wasEmpty = table.records.map((record) => record.isEmpty);

  rows.slice(0, table.records.length).forEach((row, index) => {
    const franchiseRecord = table.records[index];
    Object.keys(row).forEach((key) => {
      if (wasEmpty[index] && firstFourByteFields.has(key)) return;
      if (cellsMatch(franchiseRecord[key], row[key])) return;
      franchiseRecord[key] = row[key];
    });
  });
}

/**
 * Registers IPC handlers for external data import/export operations.
 * Moves xlsx processing and table/file operations from renderer to main process.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {FranchiseFileManager} franchiseFileManager
 */
function registerExternalDataHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Import table data from CSV/XLSX file.
   * Returns parsed JSON data from the first sheet.
   */
  loggedIpc.handle("external-data:import", async (event, filePath) => {
    try {
      const buffer = fs.readFileSync(filePath);
      const wb = xlsx.read(buffer, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      return xlsx.utils.sheet_to_json(sheet, { raw: false });
    } catch (error) {
      throw new Error(`Failed to import table data: ${error.message}`);
    }
  });

  /**
   * Export table data to CSV/XLSX file.
   * Receives headers and row data, creates spreadsheet.
   */
  loggedIpc.handle(
    "external-data:export",
    async (event, filePath, headers, rows) => {
      try {
        const wb = xlsx.utils.book_new();
        const data = [headers, ...rows];
        const ws = xlsx.utils.json_to_sheet(data, { skipHeader: true });
        xlsx.utils.book_append_sheet(wb, ws);

        const isCsv = filePath.endsWith(".csv");
        const buffer = xlsx.write(wb, {
          type: "buffer",
          bookType: isCsv ? "csv" : "xlsx",
        });

        fs.writeFileSync(filePath, buffer);
      } catch (error) {
        throw new Error(`Failed to export table data: ${error.message}`);
      }
    },
  );

  /**
   * Export raw table buffer to file.
   */
  loggedIpc.handle(
    "external-data:export-raw",
    async (event, fileId, tableId, filePath) => {
      try {
        const entry = franchiseFileManager.activeFiles.get(fileId);
        if (!entry) throw new Error(`File not found: ${fileId}`);

        const table = entry.file.getTableById(tableId);
        if (!table) throw new Error(`Table not found: ${tableId}`);

        fs.writeFileSync(filePath, table.data);
      } catch (error) {
        throw new Error(`Failed to export raw table: ${error.message}`);
      }
    },
  );

  /**
   * Export raw FRT file contents.
   */
  loggedIpc.handle(
    "external-data:export-frt",
    async (event, fileId, filePath) => {
      try {
        const entry = franchiseFileManager.activeFiles.get(fileId);
        if (!entry) throw new Error(`File not found: ${fileId}`);

        fs.writeFileSync(filePath, entry.file.unpackedFileContents);
      } catch (error) {
        throw new Error(`Failed to export FRT: ${error.message}`);
      }
    },
  );

  /**
   * Import raw table data from file and replace table contents.
   */
  loggedIpc.handle(
    "external-data:import-raw",
    async (event, fileId, tableId, filePath) => {
      try {
        const entry = franchiseFileManager.activeFiles.get(fileId);
        if (!entry) throw new Error(`File not found: ${fileId}`);

        const table = entry.file.getTableById(tableId);
        if (!table) throw new Error(`Table not found: ${tableId}`);

        const tableData = fs.readFileSync(filePath);
        await table.replaceRawData(tableData, true);
      } catch (error) {
        throw new Error(`Failed to import raw table: ${error.message}`);
      }
    },
  );

  // ---------------------------------------------------------------------------
  // Bulk edit imported rows (CSV/XLSX) into an existing table.
  // This handler receives the parsed rows from the renderer and replaces the
  // records of the target table while preserving record IDs. It runs entirely
  // in the main process, ensuring the FranchiseFile is mutated only there.
  // ---------------------------------------------------------------------------
  loggedIpc.handle(
    "external-data:import-bulk",
    async (event, fileId, tableId, rows) => {
      try {
        console.time("import-bulk");
        const entry = franchiseFileManager.activeFiles.get(fileId);
        if (!entry) throw new Error(`File not found: ${fileId}`);

        const table = entry.file.getTableById(tableId);
        if (!table) throw new Error(`Table not found: ${tableId}`);

        const flipSaveOnChange = entry.file.settings.saveOnChange;
        entry.file.settings.saveOnChange = false;

        // Follow the renderer's original logic: only update existing records
        // up to the current record count, ignoring any extra rows.
        console.time("set");
        applyImportedRows(table, rows);
        console.timeEnd("set");

        console.time("recalc");
        try {
          table.recalculateEmptyRecordReferences();
        } catch (recalcError) {
          console.warn(
            `Could not recalculate empty record references for table ${tableId}: ${recalcError.message}`,
          );
        }
        console.timeEnd("recalc");

        if (flipSaveOnChange) {
          entry.file.save();
          entry.file.settings.saveOnChange = true;
        }

        console.timeEnd("import-bulk");

        return { success: true };
      } catch (error) {
        throw new Error(`Failed to bulk import rows: ${error.message}`);
      }
    },
  );
}

module.exports = { registerExternalDataHandlers, applyImportedRows };
