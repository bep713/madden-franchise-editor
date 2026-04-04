const xlsx = require("xlsx");
const fs = require("fs");

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
}

module.exports = { registerExternalDataHandlers };
