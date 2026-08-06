/**
 * Handler for file reload notifications.
 * Manages IPC channels for detecting external file changes and user-initiated reload/save-new actions.
 */

function registerReloadFileHandlers(loggedIpc, options = {}) {
  const { loggedMain: getLoggedMain, setTemporaryWindowTitle } = options;

  loggedIpc.on("reload-file", function (_event, path) {
    if (setTemporaryWindowTitle) {
      setTemporaryWindowTitle("Reloading...");
    }
    const loggedMain = getLoggedMain();
    if (loggedMain) {
      loggedMain.send("reload-file", path);
    }
  });

  loggedIpc.on("save-new-file", function () {
    const loggedMain = getLoggedMain();
    if (loggedMain) {
      loggedMain.send("save-new-file");
    }
  });
}

module.exports = { registerReloadFileHandlers };
