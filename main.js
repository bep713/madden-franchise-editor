const path = require("path");
const chokidar = require("chokidar");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  dialog,
} = require("electron");
const { autoUpdater } = require("electron-updater");
const preferencesHandler = require("./main/handlers/preferencesHandler");
const franchiseFileManager = require("./main/services/FranchiseFileManager");
const {
  registerExternalDataHandlers,
} = require("./main/handlers/externalDataHandler");
const {
  registerRecentFilesHandlers,
} = require("./main/handlers/recentFilesHandler");
const {
  registerReloadFileHandlers,
} = require("./main/handlers/reloadFileHandler");
const { registerSchemaHandlers } = require("./main/handlers/schemaHandler");
const {
  registerSchemaMismatchHandlers,
} = require("./main/handlers/schemaMismatchHandler");
const {
  registerSchemaSearchHandlers,
} = require("./main/handlers/schemaSearchHandler");
const {
  registerSchemaViewerHandlers,
} = require("./main/handlers/schemaViewerHandler");
const { registerScheduleHandlers } = require("./main/handlers/scheduleHandler");
const { registerUpdateHandlers } = require("./main/handlers/updateHandler");
const { registerWelcomeHandlers } = require("./main/handlers/welcomeHandler");
const {
  createLoggedIpcMain,
  createLoggedWebContents,
} = require("./main/utils/ipcLogger");
const packageJson = require("./package.json");

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow, workerWindow, schemaWindow, settingsWindow;
// Logged webContents wrappers (assigned in createWindow, used in addIpcListeners)
let loggedMain, loggedWorker, loggedSchema, loggedSettings;
let mainReady = false;
let workerReady = false;
let pendingMainEvents = [];
let pendingWorkerEvents = [];
const isDev = process.env.NODE_ENV === "development";

let fileDependentMenuItems = ["CloseFile", "RevealInExplorer"];

if (isDev) {
  // Watch main process files and bundle outputs only.
  // Renderer source changes are handled by the bundler — electron-reload
  // picks up the rebuilt bundles for a single refresh.
  require("electron-reload")(
    [
      path.join(__dirname, "main.js"),
      path.join(__dirname, "main"),
      path.join(__dirname, "preload"),
      path.join(__dirname, "renderer", "js", "bundle.js"),
      path.join(__dirname, "renderer", "js", "*.bundle.js"),
    ],
    {
      // Ignore node_modules (except madden-franchise), dotfiles, temp dirs
      ignored: [
        /node_modules\/(?!madden-franchise)/,
        /[\/\\]\./,
        /temp/,
        /\.watcher-ready$/,
      ],
    },
  );
}

const remoteMain = require("@electron/remote/main");
remoteMain.initialize();

// Create logged IPC wrappers (dev-only logging)
const loggedIpc = createLoggedIpcMain(ipcMain);

// Register franchise IPC handlers
franchiseFileManager.registerIpcHandlers(loggedIpc);
registerExternalDataHandlers(loggedIpc, franchiseFileManager);
preferencesHandler.registerPreferencesHandlers(loggedIpc);
registerRecentFilesHandlers(loggedIpc);
registerWelcomeHandlers(loggedIpc, franchiseFileManager);
registerReloadFileHandlers(loggedIpc, {
  loggedMain: () => loggedMain,
  setTemporaryWindowTitle,
});
registerSchemaHandlers(loggedIpc, franchiseFileManager);
registerSchemaMismatchHandlers(loggedIpc, franchiseFileManager);
registerSchemaSearchHandlers(loggedIpc, franchiseFileManager);
registerSchemaViewerHandlers(loggedIpc, franchiseFileManager);
registerScheduleHandlers(loggedIpc, franchiseFileManager);
registerUpdateHandlers(loggedIpc, autoUpdater, isDev, loggedMain);

// Register external URL handler
loggedIpc.on("open-external-url", (event, url) => {
  shell.openExternal(url);
});

// --- Application Menu ---
function createApplicationMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          id: "Import",
          label: "Import",
          accelerator: "CmdOrCtrl+I",
          click: () => loggedMain.send("import-file"),
          enabled: false,
        },
        {
          id: "Export",
          label: "Export",
          accelerator: "CmdOrCtrl+E",
          click: () => loggedMain.send("export-file"),
          enabled: false,
        },
        {
          id: "Save",
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => loggedMain.send("save-file"),
          enabled: false,
        },
        {
          id: "CloseFile",
          label: "Close File",
          accelerator: "CmdOrCtrl+Shift+X",
          click: () => loggedMain.send("close-file"),
          enabled: false,
        },
        {
          id: "ShowPreferences",
          label: "Preferences",
          accelerator: "CmdOrCtrl+Shift+P",
          click: () => loggedMain.send("show-preferences-window"),
        },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forcereload" },
        {
          label: "Toggle Developer Tools",
          accelerator:
            process.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
          click: () => mainWindow.webContents.toggleDevTools(),
        },
        { type: "separator" },
        { role: "resetzoom" },
        { role: "zoomin" },
        { role: "zoomout" },
        { type: "separator" },
        {
          id: "RevealInExplorer",
          label: "Reveal in Explorer",
          accelerator: "CmdOrCtrl+Shift+E",
          click: () => {
            if (currentFilePath) shell.showItemInFolder(currentFilePath);
          },
          enabled: false,
        },
      ],
    },
    {
      role: "window",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
    {
      label: "Tools",
      submenu: [
        {
          id: "ShowOffsetHelper",
          label: "Offset Helper",
          accelerator: "CmdOrCtrl+Shift+O",
          click: () =>
            shell.openExternal(
              "https://bep713.github.io/offset-tool/index.html",
            ),
          enabled: true,
        },
        {
          id: "LogTable",
          label: "Log Table to Console",
          accelerator: "CmdOrCtrl+L",
          click: () => loggedMain.send("log-table"),
          enabled: false,
        },
        {
          id: "ExportRawTable",
          label: "Export Raw Table",
          click: () => loggedMain.send("export-raw-table"),
          enabled: false,
        },
        {
          id: "ExportFRT",
          label: "Export FRT File",
          click: () => loggedMain.send("export-frt"),
          enabled: false,
        },
        { type: "separator" },
        {
          id: "ImportRawTable",
          label: "Import Raw Table",
          click: () => loggedMain.send("import-raw-table"),
          enabled: false,
        },
      ],
    },
    {
      label: "About",
      submenu: [
        {
          id: "OpenProjectHomepage",
          label: "Open Project Homepage",
          click: () =>
            shell.openExternal(
              "https://github.com/bep713/madden-franchise-editor",
            ),
        },
        {
          id: "Credits",
          label: "Credits",
          click: () => {
            const creditsWindow = new BrowserWindow({
              title: "Credits",
              width: 1000,
              height: 500,
              parent: mainWindow,
            });
            remoteMain.enable(creditsWindow.webContents);
            creditsWindow.loadFile("renderer/credits.html");
            creditsWindow.on("closed", () => {});
          },
        },
        {
          id: "CheckForUpdate",
          label: "Check for Update",
          click: () => {
            if (isDev) autoUpdater.checkForUpdates();
            else autoUpdater.checkForUpdatesAndNotify();
          },
        },
        {
          id: "ViewReleaseNotes",
          label: "View Release Notes",
          click: () => loggedMain.send("show-settings-manager"),
        },
      ],
    },
  ];

  if (process.platform === "darwin") {
    const name = app.getName();
    template.unshift({
      label: name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services", submenu: [] },
        { type: "separator" },
        { role: "hide" },
        { role: "hideothers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
    template[2].submenu.push(
      { type: "separator" },
      {
        label: "Speech",
        submenu: [{ role: "startspeaking" }, { role: "stopspeaking" }],
      },
    );
    template[4].submenu = [
      { label: "Close", accelerator: "CmdOrCtrl+W", role: "close" },
      { label: "Minimize", accelerator: "CmdOrCtrl+M", role: "minimize" },
      { role: "zoom" },
      { type: "separator" },
      { label: "Bring All to Front", role: "front" },
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

const homePage = "renderer/index.html";
const workerPage = "renderer/worker.html";
const creditsPage = "renderer/credits.html";
const schemaPage = "renderer/schema-manager.html";
const settingsPage = "renderer/settings-manager.html";

const baseWindowTitle = "Madden Franchise Editor";
let currentFilePath = "";
let currentFileId = "";
let waitForFileSaved = false;
let pendingSaves = [];
let baseFileWatcher;

function createWindow() {
  // Create the application menu
  createApplicationMenu();

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload", "franchisePreload.js"),
    },
    icon: path.join(__dirname, "renderer/img/icon.ico"),
  });

  remoteMain.enable(mainWindow.webContents);

  // Create logged webContents wrapper for this window
  loggedMain = createLoggedWebContents(mainWindow.webContents);

  // and load the index.html of the app.
  mainWindow.loadFile(homePage);

  if (isDev) {
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on("closed", () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    workerWindow = null;

    // Destroy hidden windows that have preventDefault close handlers
    if (schemaWindow) schemaWindow.destroy();
    schemaWindow = null;

    if (settingsWindow) settingsWindow.destroy();
    settingsWindow = null;

    if (baseFileWatcher) {
      baseFileWatcher.close();
    }

    app.quit();
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainReady = true;
    sendAllPendingMainEvents();

    const preferencesInstance = preferencesHandler.getPreferencesInstance();
    const checkForUpdates = preferencesInstance
      ? preferencesInstance.value("general.checkForUpdates")
      : undefined;

    if (checkboxSettingIsEnabled(checkForUpdates)) {
      if (isDev) {
        autoUpdater.checkForUpdates();
      } else {
        autoUpdater.checkForUpdatesAndNotify();
      }
    }

    const checkForSchemas = preferencesInstance
      ? preferencesInstance.value("general.checkForSchemaUpdates")
      : undefined;

    if (checkboxSettingIsEnabled(checkForSchemas)) {
      loggedSchema.send("schema-quick-scan", 24);
    }

    function checkboxSettingIsEnabled(setting) {
      return (
        setting !== undefined && setting.length === 1 && setting[0] === true
      );
    }
  });

  workerWindow = new BrowserWindow({
    title: "Worker",
    width: 1000,
    height: 500,
    show: isDev,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload", "franchisePreload.js"),
    },
  });

  remoteMain.enable(workerWindow.webContents);

  // Create logged webContents wrapper for this window
  loggedWorker = createLoggedWebContents(workerWindow.webContents);

  workerWindow.loadFile(workerPage);

  if (isDev) {
    workerWindow.webContents.openDevTools();
  }

  workerWindow.on("closed", () => {
    workerWindow = null;
  });

  workerWindow.webContents.on("did-finish-load", function () {
    workerReady = true;
    sendAllPendingWorkerEvents();
  });

  preferencesHandler.initialize();
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.autoDownload = false;

  createSchemaWindow(isDev);
  createSettingsWindow(isDev);
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", () => {
  mainReady = false;
  workerReady = false;

  pendingMainEvents = [];
  pendingWorkerEvents = [];

  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});

addIpcListeners();
addAutoUpdaterListeners();

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function addIpcListeners() {
  ipcMain.on("close-file", function () {
    currentFilePath = "";
    pendingSaves = [];
    setCurrentWindowTitle(baseWindowTitle);
    disableFileMenuItems();

    // Close all active franchise files
    franchiseFileManager.activeFiles.clear();

    if (schemaWindow) {
      schemaWindow.close();
    }

    if (baseFileWatcher) {
      baseFileWatcher.close();
    }
  });

  ipcMain.on("file-loaded", function (event, file) {
    currentFilePath = file.path;
    currentFileId = file.fileId || "";
    loggedMain.send("file-loaded", file);

    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
    enableFileMenuItems();
    watchFile(currentFilePath);
  });

  ipcMain.on("reveal-in-explorer", function () {
    if (currentFilePath) {
      shell.showItemInFolder(currentFilePath);
    }
  });

  ipcMain.on("save-file", function () {
    loggedMain.send("save-file");
  });

  ipcMain.on("import-file", function () {
    loggedMain.send("import-file");
  });

  ipcMain.on("export-file", function () {
    loggedMain.send("export-file");
  });

  ipcMain.on("saving", function () {
    setCurrentWindowTitle(
      `${baseWindowTitle} - ${currentFilePath} - Saving...`,
    );
    pendingSaves.push({
      time: Date.now(),
    });
  });

  ipcMain.on("saved", function () {
    setTemporaryWindowTitle("Saved");

    setTimeout(() => {
      waitForFileSaved = false;
      pendingSaves.pop();
    }, 500);
  });

  ipcMain.on("exporting", function () {
    setCurrentWindowTitle(
      `${baseWindowTitle} - ${currentFilePath} - Exporting...`,
    );
  });

  ipcMain.on("exported", function () {
    setTemporaryWindowTitle("Exported successfully");
  });

  ipcMain.on("export-error", function () {
    setTemporaryWindowTitle("Export failed");
  });

  ipcMain.on("importing", function () {
    setCurrentWindowTitle(
      `${baseWindowTitle} - ${currentFilePath} - Importing...`,
    );
  });

  ipcMain.on("imported", function () {
    setTemporaryWindowTitle("Imported successfully");
  });

  ipcMain.on("read-schema", function (event, arg) {
    passOrDelayWorkerIpcEvent("read-schema", arg);
  });

  ipcMain.on("read-schema-done", function (event, arg) {
    passOrDelayMainIpcEvent("read-schema-done", arg);
  });

  ipcMain.on("log-table", function () {
    loggedMain.send("log-table");
  });

  ipcMain.on("export-raw-table", function () {
    loggedMain.send("export-raw-table");
  });

  ipcMain.on("export-frt", function () {
    loggedMain.send("export-frt");
  });

  ipcMain.on("import-raw-table", function () {
    loggedMain.send("import-raw-table");
  });

  ipcMain.on("show-credits", function () {
    let creditsWindow = new BrowserWindow({
      title: "Credits",
      width: 1000,
      height: 500,
      parent: mainWindow,
    });

    remoteMain.enable(creditsWindow.webContents);

    creditsWindow.loadFile(creditsPage);

    creditsWindow.on("closed", function () {
      creditsWindow = null;
    });
  });

  ipcMain.on("show-schema-manager", function (event, arg) {
    createSchemaWindow();
    loggedSchema.send("get-schema-info-response", arg);
  });

  ipcMain.on("load-schema", function (event, arg) {
    loggedMain.send("load-schema", arg);
  });

  ipcMain.on("load-schema-done", function (event, arg) {
    loggedSchema.send("load-schema-done", arg);
  });

  ipcMain.on("get-schema-info-request", function (event, arg) {
    loggedMain.send("get-schema-info-request", arg);
  });

  ipcMain.on("get-schema-info-response", function (event, arg) {
    loggedSchema.send("get-schema-info-response", arg);
  });

  ipcMain.on("show-settings-manager", function () {
    createSettingsWindow(true);
    loggedSettings.send("show-release-notes-dialog");
  });

  ipcMain.on("show-preferences-window", function () {
    createSettingsWindow(true);
    loggedSettings.send("show-settings-dialog");
  });

  ipcMain.on("is-currently-searching", () => {
    loggedSchema.send("is-currently-searching");
  });

  ipcMain.on("currently-searching-response", (event, arg) => {
    loggedMain.send("currently-searching-response", arg);
  });

  // Dialog and App IPC handlers (replaces @electron/remote usage)
  ipcMain.handle("dialog:show-save", async (event, options) => {
    return await dialog.showSaveDialog(mainWindow, options);
  });

  ipcMain.handle("dialog:show-open", async (event, options) => {
    return await dialog.showOpenDialog(mainWindow, options);
  });

  ipcMain.handle("dialog:show-message", async (event, options) => {
    return await dialog.showMessageBox(mainWindow, options);
  });

  ipcMain.handle("app:get-user-data-path", () => {
    return app.getPath("userData");
  });

  ipcMain.handle("app:get-documents-path", () => {
    return app.getPath("documents");
  });

  ipcMain.handle("app:get-version", () => {
    return packageJson.version;
  });

  ipcMain.handle("app:get-active-file-id", () => {
    // Return the most recently opened fileId from the manager
    const ids = [...franchiseFileManager.activeFiles.keys()];
    return ids.length > 0 ? ids[ids.length - 1] : null;
  });

  // --- File system IPC handlers (replaces fs in renderer) ---
  const realFs = require("fs");

  // Read/write JSON config files in user data directory
  ipcMain.handle("fs:read-json", (event, filename) => {
    const filePath = path.join(app.getPath("userData"), filename);
    try {
      if (!realFs.existsSync(filePath)) return null;
      return JSON.parse(realFs.readFileSync(filePath, "utf-8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("fs:write-json", (event, filename, data) => {
    const filePath = path.join(app.getPath("userData"), filename);
    realFs.writeFileSync(filePath, JSON.stringify(data));
  });

  // Check if a file exists (any path)
  ipcMain.handle("fs:exists", (event, filePath) => {
    return realFs.existsSync(filePath);
  });

  // Read a file as string (for HTML templates etc)
  ipcMain.handle("fs:read-file", (event, filePath) => {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(__dirname, filePath);
    return realFs.readFileSync(resolvedPath, "utf-8");
  });

  // Read a file as base64 (for binary data)
  ipcMain.handle("fs:read-file-base64", (event, filePath) => {
    return realFs.readFileSync(filePath).toString("base64");
  });

  // Write a file from base64 data
  ipcMain.handle("fs:write-file-base64", (event, filePath, base64Data) => {
    realFs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  });

  // Write a file from string
  ipcMain.handle("fs:write-file", (event, filePath, data) => {
    realFs.writeFileSync(filePath, data);
  });

  // Create directory recursively
  ipcMain.handle("fs:mkdir", (event, dirPath) => {
    realFs.mkdirSync(dirPath, { recursive: true });
  });

  // Read directory contents
  ipcMain.handle("fs:readdir", (event, dirPath) => {
    return realFs.readdirSync(dirPath);
  });

  // Export table data to file
  ipcMain.handle("fs:export-table", (event, filePath, base64Data) => {
    realFs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
  });

  // Import table data from file
  ipcMain.handle("fs:import-table", (event, filePath) => {
    return realFs.readFileSync(filePath).toString("base64");
  });

  // Schedule file operations
  ipcMain.handle("schedules:list", () => {
    const schedulesDir = path.join(__dirname, "schedules");
    try {
      return realFs.readdirSync(schedulesDir).reverse();
    } catch {
      return [];
    }
  });

  ipcMain.handle("schedules:read", (event, filename) => {
    const schedulesDir = path.join(__dirname, "schedules");
    const filePath = path.join(schedulesDir, filename);
    try {
      const content = realFs.readFileSync(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  });

  ipcMain.handle("menu:click-item", (event, menuItemId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const menuItem = Menu.getApplicationMenu()?.getMenuItemById(menuItemId);

    if (!menuItem) {
      throw new Error(`Menu item not found: ${menuItemId}`);
    }

    menuItem.click(null, win);
  });

  // Open path in default application (replaces shell.openPath)
  ipcMain.on("open-path", (event, filePath) => {
    shell.openPath(filePath);
  });
}

function createSchemaWindow(show) {
  if (schemaWindow) {
    schemaWindow.moveTop();
    schemaWindow.show();
    return;
  }

  schemaWindow = new BrowserWindow({
    title: "Schema",
    width: 600,
    height: 650,
    show: show !== null ? show : true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload", "franchisePreload.js"),
    },
  });

  remoteMain.enable(schemaWindow.webContents);

  // Create logged webContents wrapper for this window
  loggedSchema = createLoggedWebContents(schemaWindow.webContents);

  if (isDev) {
    schemaWindow.webContents.openDevTools();
  }

  schemaWindow.removeMenu();
  schemaWindow.fullScreenable = false;
  schemaWindow.maximizable = false;
  schemaWindow.loadFile(schemaPage);

  schemaWindow.on("close", function (e) {
    if (schemaWindow) {
      schemaWindow.hide();
      e.preventDefault();
    }
  });

  schemaWindow.on("closed", function () {
    schemaWindow = null;
  });
}

function createSettingsWindow(show) {
  if (settingsWindow) {
    settingsWindow.moveTop();
    settingsWindow.show();
    return;
  }

  settingsWindow = new BrowserWindow({
    title: "Settings",
    width: 1100,
    height: 650,
    show: show !== null ? show : false,
    frame: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload", "franchisePreload.js"),
    },
  });
  remoteMain.enable(settingsWindow.webContents);

  // Create logged webContents wrapper for this window
  loggedSettings = createLoggedWebContents(settingsWindow.webContents);

  if (isDev) {
    settingsWindow.webContents.openDevTools();
    settingsWindow.width = settingsWindow.width + 500;
  }

  settingsWindow.removeMenu();
  settingsWindow.fullScreenable = false;
  settingsWindow.maximizable = false;
  settingsWindow.loadFile(settingsPage);

  settingsWindow.on("close", function (e) {
    if (settingsWindow) {
      settingsWindow.hide();
      e.preventDefault();
    }
  });

  settingsWindow.on("closed", function () {
    settingsWindow = null;
  });
}

function addAutoUpdaterListeners() {
  function sendStatusToWindow(text) {
    // mainWindow.webContents.send('message', text);
  }

  autoUpdater.on("checking-for-update", () => {
    loggedMain.send("checking-for-updates");
  });

  autoUpdater.on("update-available", (info) => {
    loggedMain.send("update-ready");
  });

  autoUpdater.on("update-not-available", (info) => {
    loggedMain.send("update-not-available");
  });

  autoUpdater.on("error", (err) => {
    loggedMain.send("update-error", err);
  });

  autoUpdater.on("download-progress", (progressObj) => {
    let log_message = "Download speed: " + progressObj.bytesPerSecond;
    log_message = log_message + " - Downloaded " + progressObj.percent + "%";
    log_message =
      log_message +
      " (" +
      progressObj.transferred +
      "/" +
      progressObj.total +
      ")";
    loggedMain.send("update-progress", progressObj);
  });

  autoUpdater.on("update-downloaded", (info) => {
    loggedMain.send("update-downloaded");
  });
}

function setTemporaryWindowTitle(message) {
  setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath} - ${message}`);
  setTimeout(() => {
    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
  }, 2500);
}

function passOrDelayWorkerIpcEvent(event, ...arg) {
  if (workerReady) {
    loggedWorker.send(event, arg);
  } else {
    pendingWorkerEvents.push({
      event: "read-schema",
      args: arg,
    });
  }
}

function passOrDelayMainIpcEvent(event, ...arg) {
  if (mainReady) {
    loggedMain.send(event, arg);
  } else {
    pendingMainEvents.push({
      event: event,
      args: arg,
    });
  }
}

function setCurrentWindowTitle(title) {
  mainWindow.setTitle(title);
}

function sendAllPendingWorkerEvents() {
  pendingWorkerEvents.forEach((event) => {
    loggedWorker.send(event.event, event.arg);
  });

  pendingWorkerEvents = [];
}

function sendAllPendingMainEvents() {
  pendingMainEvents.forEach((event) => {
    loggedMain.send(event.event, event.arg);
  });

  pendingMainEvents = [];
}

function enableFileMenuItems() {
  enableMenuIds(fileDependentMenuItems);
}

function disableFileMenuItems() {
  disableMenuIds(fileDependentMenuItems);
}

function enableMenuIds(menuItems) {
  return mutateMenuIds(menuItems, "enabled", true);
}

function disableMenuIds(menuItems) {
  return mutateMenuIds(menuItems, "enabled", false);
}

function mutateMenuIds(menuItems, key, value) {
  if (!Array.isArray(menuItems)) {
    return;
  }

  const menu = Menu.getApplicationMenu();

  if (menu) {
    menuItems.forEach((id) => {
      const item = menu.getMenuItemById(id);
      if (item) {
        item[key] = value;
      }
    });
  }
}

// IPC handlers for menu state control from renderer
ipcMain.on("menu:enable", (event, ids) => {
  if (Array.isArray(ids)) enableMenuIds(ids);
});
ipcMain.on("menu:disable", (event, ids) => {
  if (Array.isArray(ids)) disableMenuIds(ids);
});

function watchFile(filePath) {
  if (baseFileWatcher) {
    baseFileWatcher.close();
  }

  baseFileWatcher = chokidar.watch(filePath).on("change", (event, path) => {
    if (!waitForFileSaved && pendingSaves.length === 0) {
      loggedMain.send("file-changed", path);
    }
  });
}
