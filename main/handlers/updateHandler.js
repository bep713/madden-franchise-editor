const { shell } = require("electron");

/**
 * Register IPC handlers for update-related operations.
 * The update state lives in the update controller (updateController.js).
 */
function registerUpdateHandlers(
  loggedIpc,
  controller,
  { getReleasePageUrl, getUpdateChannel },
) {
  // Check for updates (always manual: the user asked)
  loggedIpc.on("update:check", () => {
    controller.check({ manual: true });
  });

  // Install update (prompt for unsaved changes, download, quit to install)
  loggedIpc.on("update:install", () => {
    controller.install();
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
