/**
 * Handler for file reload notifications.
 * Manages IPC channels for detecting external file changes and user-initiated reload/save-new actions.
 */

function registerReloadFileHandlers(loggedIpc, options = {}) {
  const { loggedMain, setTemporaryWindowTitle } = options;

  loggedIpc.on("reload-file", function () {
    if (setTemporaryWindowTitle) {
      setTemporaryWindowTitle("Reloading...");
    }
    if (loggedMain) {
      loggedMain.send("reload-file");
    }
  });

  loggedIpc.on("save-new-file", function () {
    if (loggedMain) {
      loggedMain.send("save-new-file");
    }
  });
}

module.exports = { registerReloadFileHandlers };
