const path = require("path");
const fs = require("fs").promises;
const { app } = require("electron");

/**
 * Registers IPC handlers for schema initialization and path management.
 * Moves schema directory initialization from renderer to main process.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {FranchiseFileManager} franchiseFileManager
 */
function registerSchemaHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Initialize schema directory and return its path.
   * Creates the schemas directory in userData if it doesn't exist.
   */
  loggedIpc.handle("schema:initialize", async () => {
    try {
      const schemaPath = path.join(app.getPath("userData"), "schemas");
      await fs.mkdir(schemaPath, { recursive: true });
      return schemaPath;
    } catch (error) {
      throw new Error(
        `Failed to initialize schema directory: ${error.message}`,
      );
    }
  });

  /**
   * Generate schema and write to XML file.
   * Handles file existence check, path renaming, and file writing in main process.
   */
  loggedIpc.handle("schema:write-xml", async (event, data, outputPath) => {
    try {
      if (!data || !outputPath) {
        throw new Error("Invalid arguments: data and outputPath are required");
      }

      // Generate schema via franchiseFileManager
      const result = await franchiseFileManager.generateSchema(data);

      // Check if file exists and adjust path if needed
      let finalPath = outputPath;
      try {
        await fs.access(outputPath);
        // File exists, append _1 suffix before extension
        const ext = path.extname(outputPath);
        const base = outputPath.slice(0, -ext.length);
        finalPath = `${base}_1${ext}`;
      } catch {
        // File doesn't exist, use original path
      }

      // Write the file
      await fs.writeFile(finalPath, result.data);

      return { success: true, outputPath: finalPath };
    } catch (error) {
      throw new Error(`Failed to write XML schema: ${error.message}`);
    }
  });
}

module.exports = { registerSchemaHandlers };
