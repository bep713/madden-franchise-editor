const { ipcRenderer } = require("electron");

let menuService = {};

// Menu is now managed in the main process
// These methods send IPC commands to main process

menuService.importFile = function () {
  ipcRenderer.send("import-file");
};

menuService.exportFile = function () {
  ipcRenderer.send("export-file");
};

menuService.exportFrt = function () {
  ipcRenderer.send("export-frt");
};

menuService.saveFile = function () {
  ipcRenderer.send("save-file");
};

menuService.saveFileAs = function () {
  ipcRenderer.send("save-file-as");
};

menuService.closeFile = function () {
  ipcRenderer.send("close-file");
};

menuService.doRevealInExplorer = function () {
  ipcRenderer.send("reveal-in-explorer");
};

menuService.showOffsetHelper = function () {
  ipcRenderer.send(
    "open-external-url",
    "https://bep713.github.io/offset-tool/index.html",
  );
};

menuService.logTable = function () {
  ipcRenderer.send("log-table");
};

menuService.copyUniqueId = function () {
  ipcRenderer.send("copy-unique-id");
};

menuService.exportRawTable = function () {
  ipcRenderer.send("export-raw-table");
};

menuService.importRawTable = function () {
  ipcRenderer.send("import-raw-table");
};

menuService.openPreferencesWindow = function () {
  ipcRenderer.send("show-preferences-window");
};

menuService.checkForUpdate = function () {
  ipcRenderer.send("check-for-update");
};

menuService.openProjectHomepage = function () {
  ipcRenderer.send(
    "open-external-url",
    "https://github.com/bep713/madden-franchise-editor",
  );
};

menuService.openCredits = function () {
  ipcRenderer.send("show-credits");
};

menuService.viewReleaseNotes = function () {
  ipcRenderer.send("show-settings-manager");
};

menuService.enableMenuIds = function (ids) {
  ipcRenderer.send("menu:enable", ids);
};

menuService.disableMenuIds = function (ids) {
  ipcRenderer.send("menu:disable", ids);
};

module.exports = menuService;
