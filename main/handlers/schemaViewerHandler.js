/**
 * Registers IPC handlers for schema viewer operations.
 * Moves schema field extraction and schema info retrieval from renderer to main process.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {FranchiseFileManager} franchiseFileManager
 */
function registerSchemaViewerHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Get all schema fields from a franchise file.
   * Extracts all fields from all table schemas and returns a flat array.
   */
  loggedIpc.handle("schema-viewer:get-fields", async (event, fileId) => {
    try {
      if (!fileId) {
        throw new Error("Invalid arguments: fileId is required");
      }

      const entry = franchiseFileManager.activeFiles.get(fileId);
      if (!entry) {
        throw new Error(`File not found: ${fileId}`);
      }
      const file = entry.file;

      const fields = getAllFields(file);
      return fields;
    } catch (error) {
      throw new Error(`Failed to get schema fields: ${error.message}`);
    }
  });

  /**
   * Get schema version info for a franchise file.
   * Returns both the loaded schema info and expected schema version.
   */
  loggedIpc.handle("schema-viewer:get-schema-info", async (event, fileId) => {
    try {
      if (!fileId) {
        throw new Error("Invalid arguments: fileId is required");
      }

      const entry = franchiseFileManager.activeFiles.get(fileId);
      if (!entry) {
        throw new Error(`File not found: ${fileId}`);
      }
      const file = entry.file;

      return {
        schemaInfo: file.schemaList.meta,
        expectedSchemaVersion: file.expectedSchemaVersion,
        gameType: file.gameType,
      };
    } catch (error) {
      throw new Error(`Failed to get schema info: ${error.message}`);
    }
  });
}

/**
 * Extract all schema fields from a franchise file.
 * Filters tables that have schemas, then flattens all schema attributes
 * into an array of { name, table, type } objects.
 * @param {FranchiseFile} file - The franchise file instance
 * @returns {Array<{name: string, table: string, type: string}>}
 */
function getAllFields(file) {
  const filteredTables = file.tables.filter((table) => table.schema);
  return filteredTables
    .map((table) => {
      return table.schema.attributes.map((schemaAttrib) => {
        return {
          name: schemaAttrib.name,
          table: table.name,
          type: schemaAttrib.type,
        };
      });
    })
    .flat();
}

module.exports = { registerSchemaViewerHandlers };
