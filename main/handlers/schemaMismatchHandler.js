/**
 * Registers IPC handlers for schema mismatch detection.
 * Moves schema version comparison logic from renderer to main process.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {FranchiseFileManager} franchiseFileManager
 */
function registerSchemaMismatchHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Check if a file has a schema version mismatch.
   * Compares expectedSchemaVersion against the loaded schema's meta.
   * @param {Electron.IpcMainInvokeEvent} event
   * @param {string} fileId
   * @returns {{ hasMismatch: boolean, expected?: object, used?: object }}
   */
  loggedIpc.handle("schema-mismatch:check", async (event, fileId) => {
    try {
      if (!fileId || typeof fileId !== "string") {
        throw new Error(
          "Invalid arguments: fileId is required and must be a string",
        );
      }

      const entry = franchiseFileManager.activeFiles.get(fileId);
      if (!entry) {
        throw new Error(`No active file found with id: ${fileId}`);
      }

      const file = entry.file;
      const expectedSchema = file.expectedSchemaVersion;
      const usedSchema = file.schemaList?.meta;

      // If no schema is loaded, treat as a mismatch
      if (!usedSchema) {
        return {
          hasMismatch: true,
          expected: expectedSchema || null,
          used: null,
        };
      }

      const hasMismatch =
        expectedSchema.major !== usedSchema.major ||
        expectedSchema.minor !== usedSchema.minor ||
        (expectedSchema.gameYear &&
          expectedSchema.gameYear !== usedSchema.gameYear);

      return {
        hasMismatch,
        expected: expectedSchema || null,
        used: usedSchema || null,
      };
    } catch (error) {
      throw new Error(`Failed to check schema mismatch: ${error.message}`);
    }
  });
}

module.exports = { registerSchemaMismatchHandlers };
