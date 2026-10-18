const { shell } = require("electron");

/**
 * Register IPC handlers for update-related operations.
 * This moves Electron API usage (shell) from renderer to main process.
 */
function registerUpdateHandlers(
  loggedIpc,
  getAutoUpdater,
  getLoggedMain,
  { runUpdateCheck, getReleasePageUrl, getUpdateChannel },
) {
  // Check for updates
  loggedIpc.on("update:check", () => {
    runUpdateCheck();
  });

  // Install update (download and quit to install)
  loggedIpc.on("update:install", () => {
    const loggedMain = getLoggedMain();
    try {
      loggedMain.send("update-downloading");
      const autoUpdater = getAutoUpdater();
      autoUpdater
        .downloadUpdate()
        .then(() => {
          autoUpdater.quitAndInstall();
        })
        .catch((error) => {
          console.error("Failed to download update:", error);
          loggedMain.send("update-error", {
            message: error.message,
          });
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
      await shell.openExternal(getReleasePageUrl(getUpdateChannel()));
    } catch (error) {
      throw new Error(`Failed to open releases page: ${error.message}`);
    }
  });
}

module.exports = { registerUpdateHandlers };
