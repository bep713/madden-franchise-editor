const { ipcMain, shell } = require("electron");

/**
 * Main process handler for welcome screen operations.
 * Handles file opening orchestration and window title management.
 */
function registerWelcomeHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Opens a franchise file and returns metadata about the loaded file.
   * This replaces the renderer-side event emission pattern.
   */
  loggedIpc.handle("welcome:open-file", async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        throw new Error("Invalid file path provided");
      }

      // Use franchiseFileManager to open the file
      const result = await franchiseFileManager.openFile(filePath);

      return {
        success: true,
        file: result,
        path: filePath,
      };
    } catch (error) {
      throw new Error(`Failed to open file: ${error.message}`);
    }
  });

  /**
   * Reveals a file in the system file explorer.
   */
  ipcMain.handle("welcome:reveal-in-explorer", async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== "string") {
        throw new Error("Invalid file path provided");
      }
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to reveal file in explorer: ${error.message}`);
    }
  });
}

module.exports = { registerWelcomeHandlers };
