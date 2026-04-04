const { shell } = require("electron");

/**
 * Register IPC handlers for update-related operations.
 * This moves Electron API usage (shell) from renderer to main process.
 */
function registerUpdateHandlers(loggedIpc, autoUpdater, isDev, loggedMain) {
  // Check for updates
  loggedIpc.on("update:check", () => {
    try {
      if (isDev) {
        autoUpdater.checkForUpdates();
      } else {
        autoUpdater.checkForUpdatesAndNotify();
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      loggedMain.send("update-error", {
        message: error.message,
      });
    }
  });

  // Install update (download and quit to install)
  loggedIpc.on("update:install", () => {
    try {
      loggedMain.send("update-downloading");
      autoUpdater.downloadUpdate().then(() => {
        autoUpdater.quitAndInstall();
      });
    } catch (error) {
      console.error("Failed to install update:", error);
      loggedMain.send("update-error", {
        message: error.message,
      });
    }
  });

  // Open releases page in external browser
  loggedIpc.handle("update:open-release-page", async () => {
    try {
      await shell.openExternal(
        "https://github.com/bep713/madden-franchise-editor/releases",
      );
    } catch (error) {
      throw new Error(`Failed to open releases page: ${error.message}`);
    }
  });
}

module.exports = { registerUpdateHandlers };
