const startupProfiler = require("./main/services/startupProfiler");
if (startupProfiler.enabled) {
  startupProfiler.installRequireHook();
  startupProfiler.startEventLoopMonitor();
  startupProfiler.mark("main:module-start");
}
const fs = require("fs");
const path = require("path");
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  shell,
  dialog,
} = require("electron");
const preferencesHandler = require("./main/handlers/preferencesHandler");
const uiSelection = require("./main/utils/uiSelection");
const {
  listScheduleFiles,
  readScheduleFile,
} = require("./main/utils/scheduleFiles");
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
  registerSchemaImportHandlers,
} = require("./main/handlers/schemaImportHandler");
const { SchemaImporter } = require("./main/services/schemaImport");
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
const {
  getUpdateChannel,
  applyUpdateChannel,
  getReleasePageUrl,
} = require("./main/services/updateChannelService");
const autoUpdaterService = require("./main/services/autoUpdaterService");
const {
  createUpdateController,
} = require("./main/services/updateController");
const { createInstallGuard } = require("./main/services/updateInstallGuard");
const { registerWelcomeHandlers } = require("./main/handlers/welcomeHandler");
const {
  registerNotificationsHandlers,
} = require("./main/handlers/notificationsHandler");
const {
  createNotificationStore,
} = require("./main/services/notificationStore");
const { createFileWatcher } = require("./main/services/fileWatcher");
const { registerFilesHandlers } = require("./main/handlers/filesHandler");
const {
  createLoggedIpcMain,
  createLoggedWebContents,
} = require("./main/utils/ipcLogger");
const packageJson = require("./package.json");
startupProfiler.mark("main:requires-done");

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow, schemaWindow, settingsWindow;
// Logged webContents wrappers (assigned when each window is created)
let loggedMain, loggedSchema, loggedSettings;
const isDev = process.env.NODE_ENV === "development";

let fileDependentMenuItems = ["CloseFile", "RevealInExplorer", "SaveAs"];

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
      path.join(__dirname, "renderer", "css", "app-manifest.css"),
      path.join(__dirname, "renderer", "*.html"),
    ],
    {
      electron: path.join(
        __dirname,
        "node_modules",
        ".bin",
        process.platform === "win32" ? "electron.cmd" : "electron",
      ),
      hardResetMethod: "exit",
      // Ignore node_modules (except madden-franchise), dotfiles, temp dirs
      ignored: [
        /node_modules\/(?!madden-franchise)/,
        /[\/\\]\./,
        /temp/,
        /\.watcher-ready$/,
        /renderer\/sass/,
      ],
    },
  );
}

// Create logged IPC wrappers (dev-only logging)
const loggedIpc = createLoggedIpcMain(ipcMain);

// Register franchise IPC handlers
franchiseFileManager.setPreferencesProvider(() =>
  preferencesHandler.getPreferencesInstance()?.value(undefined, ""),
);
const notificationStore = createNotificationStore((channel, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
});
franchiseFileManager.setNotificationStore(notificationStore);
const EXTERNAL_CHANGE_KINDS = ["file-changed", "file-missing"];
const hasNotification = (id, kinds) =>
  notificationStore
    .list()
    .some((n) => kinds.includes(n.kind) && n.fileId === id);
// v5 pauses auto-save while the file changed on disk (or went missing) and the
// user hasn't chosen what to do, so the game's save isn't overwritten. v4 doesn't.
franchiseFileManager.setAutoSavePausedCheck(
  (id) => currentUi === "v5" && hasNotification(id, EXTERNAL_CHANGE_KINDS),
);
franchiseFileManager.registerIpcHandlers(loggedIpc);
registerNotificationsHandlers(loggedIpc, notificationStore, {
  // Dismissing the change resumes auto-save and saves edits made while paused.
  // For a missing file that save recreates it at the old path.
  onDismissed: (n) => {
    if (EXTERNAL_CHANGE_KINDS.includes(n.kind)) {
      franchiseFileManager.requestAutoSave(n.fileId);
    }
  },
});
registerExternalDataHandlers(loggedIpc, franchiseFileManager);
preferencesHandler.registerPreferencesHandlers(
  loggedIpc,
  franchiseFileManager,
  {
    loggedMain: () => loggedMain,
  },
);
registerRecentFilesHandlers(loggedIpc);
registerFilesHandlers(loggedIpc);
registerWelcomeHandlers(loggedIpc, franchiseFileManager);
registerReloadFileHandlers(loggedIpc, {
  loggedMain: () => loggedMain,
  setTemporaryWindowTitle,
});
registerSchemaHandlers(loggedIpc, franchiseFileManager);
const schemaImporter = new SchemaImporter(
  franchiseFileManager.schemaImportPort(),
);
try {
  schemaImporter.recover();
} catch (err) {
  console.error("Couldn't recover an interrupted schema add:", err);
}
registerSchemaImportHandlers(loggedIpc, schemaImporter);
registerSchemaMismatchHandlers(loggedIpc, franchiseFileManager);
registerSchemaSearchHandlers(loggedIpc, franchiseFileManager);
registerSchemaViewerHandlers(loggedIpc, franchiseFileManager);
registerScheduleHandlers(loggedIpc, franchiseFileManager);
const installGuard = createInstallGuard({
  franchiseFileManager,
  // looked up at call time so e2e dialog stubs apply
  getDialog: () => dialog,
  getWindow: () => mainWindow,
  hasPendingFileChange: (id) => hasNotification(id, ["file-changed"]),
  hasMissingFile: (id) => hasNotification(id, ["file-missing"]),
});
const updateController = createUpdateController({
  getAutoUpdater,
  isUpdaterLoaded: autoUpdaterService.isLoaded,
  send: (channel, ...args) => loggedMain?.send(channel, ...args),
  getVersion: () => app.getVersion(),
  prepareInstall: installGuard.prepareInstall,
  // Kept through the install so a failed download can be retried from the drawer
  onUpdateAvailable: (data) =>
    notificationStore.add({ kind: "update-available", data }),
  onNoUpdate: () =>
    notificationStore.removeWhere((n) => n.kind === "update-available"),
});
registerUpdateHandlers(loggedIpc, updateController, {
  getReleasePageUrl,
  getUpdateChannel,
});

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
          id: "SaveAs",
          label: "Save As...",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => loggedMain.send("save-file-as"),
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
          click: () => openPreferencesWindow(),
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
          label: "Interface",
          // Not in navigation.json, so neither UI enables/disables these.
          submenu: [
            ["v5", "UiVersionV5", "New"],
            ["v4", "UiVersionV4", "Legacy"],
          ].map(([value, id, label]) => ({
            id,
            label,
            type: "radio",
            click: () => selectUiFromMenu(value),
          })),
        },
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
          id: "CopyUniqueId",
          label: "Copy Table Unique ID",
          accelerator: "CmdOrCtrl+U",
          click: () => loggedMain.send("copy-unique-id"),
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
            creditsWindow.loadFile("renderer/credits.html");
            creditsWindow.on("closed", () => {});
          },
        },
        {
          id: "CheckForUpdate",
          label: "Check for Update",
          click: () => updateController.check({ manual: true }),
        },
        {
          id: "ViewReleaseNotes",
          label: "View Release Notes",
          click: () => openReleaseNotesWindow(),
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

// The main window loads v5 (React, src/renderer) or v4 (legacy, renderer/).
// The general.uiVersion preference picks it (v5 is the default), and changing
// it switches live (switchMainUi). MFE_RENDERER_URL (Vite dev server) /
// MFE_UI=react|v4 override the preference until the first switch.
const reactRendererUrl = process.env.MFE_RENDERER_URL;
let uiOverride = uiSelection.envUiOverride(process.env);
let currentUi = null;
const uiMenuIds = { v5: "UiVersionV5", v4: "UiVersionV4" };
const creditsPage = "renderer/credits.html";
const schemaPage = "renderer/schema-manager.html";
const settingsPage = "renderer/settings-manager.html";

const baseWindowTitle = "Madden Franchise Editor";
// Tests can shorten the startup check delay.
const STARTUP_UPDATE_CHECK_DELAY_MS =
  process.env.NODE_ENV === "testing" &&
  process.env.MFE_UPDATE_CHECK_DELAY_MS !== undefined
    ? Number(process.env.MFE_UPDATE_CHECK_DELAY_MS)
    : 3000;
let currentFilePath = "";
let currentFileId = "";
let waitForFileSaved = false;
let pendingSaves = [];
const fileWatcher = createFileWatcher({
  send: (channel, payload) => loggedMain?.send(channel, payload),
  store: notificationStore,
  shouldIgnore: () => waitForFileSaved || pendingSaves.length > 0,
});

function createWindow() {
  startupProfiler.mark("main:create-window-start");
  // Window gating below reads the prefs, so load them first.
  startupProfiler.mark("main:prefs-init-start");
  preferencesHandler.initialize();
  startupProfiler.mark("main:prefs-init-end");

  // Create the application menu
  createApplicationMenu();
  startupProfiler.mark("main:menu-done");

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
  startupProfiler.trackWindow("main", mainWindow);
  startupProfiler.mark("main:main-window-created");

  // Create logged webContents wrapper for this window
  loggedMain = createLoggedWebContents(mainWindow.webContents);

  loadMainUi();

  if (isDev) {
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  }

  // A UI switch reloads the page, whose <title> would replace the file path
  // main put in the title. Main owns the title while a file is open.
  mainWindow.on("page-title-updated", (event) => {
    if (currentFilePath) event.preventDefault();
  });

  // Emitted when the window is closed.
  mainWindow.on("closed", () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;

    // Destroy hidden windows that have preventDefault close handlers
    if (schemaWindow) schemaWindow.destroy();
    schemaWindow = null;

    if (settingsWindow) settingsWindow.destroy();
    settingsWindow = null;

    fileWatcher.close();

    app.quit();
  });

  let mainUiLoadedOnce = false;
  mainWindow.webContents.on("did-finish-load", () => {
    const firstLoad = !mainUiLoadedOnce;
    mainUiLoadedOnce = true;
    const preferencesInstance = preferencesHandler.getPreferencesInstance();
    const checkForUpdates = preferencesInstance
      ? preferencesInstance.value("general.checkForUpdates")
      : undefined;

    // Deferred so the check (and loading electron-updater) doesn't compete
    // with the renderer's startup work. Only on the first load: a reload or
    // UI switch reads the last result with app:get-update-status.
    if (firstLoad && checkboxSettingIsEnabled(checkForUpdates)) {
      setTimeout(() => {
        if (!mainWindow) return;
        startupProfiler.mark("main:update-check");
        updateController.check({ manual: false });
      }, STARTUP_UPDATE_CHECK_DELAY_MS);
    }

    const checkForSchemas = preferencesInstance
      ? preferencesInstance.value("general.checkForSchemaUpdates")
      : undefined;

    // The schema window only exists on demand. Mirror the renderer's check
    // (schemaManager.js) so it isn't created when the scan would be a no-op.
    const madden24Directory = preferencesInstance
      ? preferencesInstance.value("gameVersions.madden24Directory")
      : undefined;

    if (
      checkboxSettingIsEnabled(checkForSchemas) &&
      typeof madden24Directory === "string" &&
      madden24Directory.length > 0
    ) {
      startupProfiler.mark("main:schema-quick-scan-sent");
      // Don't pop an existing (hidden) window back up on a reload.
      if (!schemaWindow) createSchemaWindow(false);
      sendWhenLoaded(schemaWindow, loggedSchema, "schema-quick-scan", 24);
    }

    // The settings window is only needed at startup to show first-run pages.
    if (!settingsWindow && settingsPagesPending(preferencesInstance)) {
      createSettingsWindow(isDev);
    }
  });

  preferencesHandler.onPreferenceChange("general.updateChannel", (value) => {
    // If the updater isn't loaded yet, it reads the channel when it loads.
    if (autoUpdaterService.isLoaded()) {
      applyUpdateChannel(
        getAutoUpdater(),
        value === "nightly" ? "nightly" : "stable",
      );
    }

    const checkForUpdates = preferencesHandler
      .getPreferencesInstance()
      ?.value("general.checkForUpdates");
    if (checkboxSettingIsEnabled(checkForUpdates)) {
      updateController.check({ manual: true });
    }
  });

  preferencesHandler.onPreferenceChange("general.uiVersion", () => {
    // A switch made in this session follows the preference from now on.
    uiOverride = null;
    // Let preferences:set reply before the renderer that sent it goes away.
    setImmediate(switchMainUi);
  });

  startupProfiler.mark("main:create-window-end");
}

/** Load the UI picked by the env override / preference into mainWindow. */
function loadMainUi() {
  const preference = preferencesHandler
    .getPreferencesInstance()
    ?.value("general.uiVersion");
  const target = uiSelection.uiTarget({
    ui: uiSelection.resolveUi({ override: uiOverride, preference }),
    rendererUrl: reactRendererUrl,
    reactBuildExists: fs.existsSync(
      path.join(__dirname, uiSelection.V5_PAGE),
    ),
  });

  if (target.fallback) {
    const message = `${uiSelection.V5_PAGE} is missing, loading the legacy (v4) UI`;
    // In a packaged build a missing out/renderer means a broken installer.
    if (app.isPackaged) console.error(message);
    else console.warn(`${message}. Run npm run build:react.`);
  }

  currentUi = target.ui;
  // Radio items: checking one unchecks the other (writing false re-checks it).
  mutateMenuIds([uiMenuIds[target.ui]], "checked", true);

  if (target.url) {
    mainWindow.loadURL(target.url);
  } else {
    mainWindow.loadFile(target.file);
  }
}

/**
 * View -> Interface. A changed preference switches through its callback.
 * Under an env override the stored value can already be the one picked;
 * that's still a switch, so drop the override here too.
 */
function selectUiFromMenu(ui) {
  uiOverride = null;
  preferencesHandler.setPreferences({ general: { uiVersion: ui } });
  setImmediate(switchMainUi);
}

/**
 * Reload the main window into the UI the preference now picks. The open file,
 * its unsaved edits, the watcher and the other windows live in main and stay.
 */
function switchMainUi() {
  if (!mainWindow) return;
  const preference = preferencesHandler
    .getPreferencesInstance()
    ?.value("general.uiVersion");
  if (uiSelection.resolveUi({ override: uiOverride, preference }) === currentUi) {
    return;
  }

  if (currentFilePath) {
    // Each UI narrows the file menu again on its first page.
    enableFileMenuItems();
    // A saving -> saved pair cut off by the reload would leave "Saving..."
    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
  }
  pendingSaves = [];
  loadMainUi();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
if (startupProfiler.enabled) {
  app.on("ready", () => {
    startupProfiler.mark("main:ready");
    startupProfiler.startTracing();
  });
}
app.on("ready", createWindow);

// Quit when all windows are closed.
app.on("window-all-closed", () => {
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
autoUpdaterService.onCreate(updateController.attach);

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

    fileWatcher.close();
  });

  ipcMain.on("file-loaded", function (event, file) {
    currentFilePath = file.path;
    currentFileId = file.fileId || "";
    startupProfiler.mark("open:file-loaded-recv");
    loggedMain.send("file-loaded", file);

    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
    enableFileMenuItems();
    startupProfiler.mark("open:watch-start");
    fileWatcher.watch(currentFilePath, currentFileId);
    startupProfiler.mark("open:watch-end");
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

    creditsWindow.loadFile(creditsPage);

    creditsWindow.on("closed", function () {
      creditsWindow = null;
    });
  });

  ipcMain.on("show-schema-manager", function (event, arg) {
    createSchemaWindow();
    sendWhenLoaded(schemaWindow, loggedSchema, "get-schema-info-response", arg);
  });

  ipcMain.on("load-schema", function (event, arg) {
    loggedMain.send("load-schema", arg);
  });

  ipcMain.on("load-schema-done", function (event, arg) {
    if (schemaWindow) loggedSchema.send("load-schema-done", arg);
  });

  ipcMain.on("get-schema-info-request", function (event, arg) {
    loggedMain.send("get-schema-info-request", arg);
  });

  ipcMain.on("get-schema-info-response", function (event, arg) {
    if (schemaWindow) loggedSchema.send("get-schema-info-response", arg);
  });

  ipcMain.on("show-settings-manager", function () {
    openReleaseNotesWindow();
  });

  ipcMain.on("show-preferences-window", function () {
    openPreferencesWindow();
  });

  ipcMain.on("is-currently-searching", () => {
    // No schema window means no search is running.
    if (!schemaWindow) {
      loggedMain.send("currently-searching-response", false);
      return;
    }
    loggedSchema.send("is-currently-searching");
  });

  ipcMain.on("currently-searching-response", (event, arg) => {
    loggedMain.send("currently-searching-response", arg);
  });

  // Dialog and App IPC handlers (replaces @electron/remote usage)
  if (startupProfiler.enabled) {
    ipcMain.handle("perf:report", (event, payload) => {
      startupProfiler.addRendererMarks(
        startupProfiler.windowNameFor(event.sender),
        payload,
      );
    });
    ipcMain.handle("perf:report-open", (event, payload) => {
      startupProfiler.addOpenMarks(
        startupProfiler.windowNameFor(event.sender),
        payload,
      );
    });
  }

  ipcMain.handle("dialog:show-save", async (event, options) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return await dialog.showSaveDialog(parent, options);
  });

  ipcMain.handle("dialog:show-open", async (event, options) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return await dialog.showOpenDialog(parent, options);
  });

  ipcMain.handle("dialog:show-message", async (event, options) => {
    const parent = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    return await dialog.showMessageBox(parent, options);
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

  ipcMain.handle("app:get-update-status", () =>
    updateController.getStatus(),
  );

  ipcMain.handle("app:get-active-file-id", () => {
    // Return the most recently opened fileId from the manager
    const ids = [...franchiseFileManager.activeFiles.keys()];
    return ids.length > 0 ? ids[ids.length - 1] : null;
  });

  // The file a reloaded/switched UI should adopt. `loaded` is false when the
  // previous page was cut off between openFile and file-loaded.
  ipcMain.handle("app:get-active-file", () => {
    const { activeFiles } = franchiseFileManager;
    if (activeFiles.size === 0) return null;
    const fileId = activeFiles.has(currentFileId)
      ? currentFileId
      : [...activeFiles.keys()].pop();
    return {
      fileId,
      path: activeFiles.get(fileId).path,
      loaded: fileId === currentFileId,
    };
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
  ipcMain.handle("schedules:list", () =>
    listScheduleFiles(path.join(__dirname, "schedules")),
  );

  ipcMain.handle("schedules:read", (event, filename) =>
    readScheduleFile(path.join(__dirname, "schedules"), filename),
  );

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

  ipcMain.handle("preferences:hide-window", () => {
    if (settingsWindow) {
      settingsWindow.hide();
    }
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
  startupProfiler.trackWindow("schema", schemaWindow);
  startupProfiler.mark("main:schema-window-created");

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
  startupProfiler.trackWindow("settings", settingsWindow);
  startupProfiler.mark("main:settings-window-created");

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

// Sends now, or once the window has finished loading its page.
function sendWhenLoaded(win, loggedWc, channel, ...args) {
  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once("did-finish-load", () => {
      if (loggedWc) loggedWc.send(channel, ...args);
    });
    return;
  }

  loggedWc.send(channel, ...args);
}

function sendSettingsWindowEvent(channel) {
  createSettingsWindow(true);
  sendWhenLoaded(settingsWindow, loggedSettings, channel);
}

// Main-side port of the settings manager's checkPage: a first-run page needs
// showing when any of its flags is falsy.
function settingsPagesPending(preferencesInstance) {
  const pages = preferencesInstance
    ? preferencesInstance.value("settingsManager")
    : undefined;

  if (!pages || typeof pages !== "object") {
    return false;
  }

  return Object.values(pages).some(
    (page) =>
      page && typeof page === "object" && Object.values(page).some((v) => !v),
  );
}

function openReleaseNotesWindow() {
  sendSettingsWindowEvent("show-release-notes-dialog");
}

function openPreferencesWindow() {
  sendSettingsWindowEvent("show-settings-dialog");
}

function checkboxSettingIsEnabled(setting) {
  return setting !== undefined && setting.length === 1 && setting[0] === true;
}

function getAutoUpdater() {
  return autoUpdaterService.getAutoUpdater();
}

function setTemporaryWindowTitle(message) {
  setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath} - ${message}`);
  setTimeout(() => {
    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
  }, 2500);
}

function setCurrentWindowTitle(title) {
  mainWindow.setTitle(title);
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

