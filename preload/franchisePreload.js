const { contextBridge, ipcRenderer } = require("electron");

const isDev = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "testing";

// Wrap ipcRenderer.invoke for dev logging
const originalInvoke = ipcRenderer.invoke.bind(ipcRenderer);
ipcRenderer.invoke = async (channel, ...args) => {
  if (isDev) {
    console.debug(`[IPC → Main] ${channel}`, args);
  }
  try {
    const result = await originalInvoke(channel, ...args);
    if (isDev) {
      console.debug(`[IPC ← Renderer] ${channel} (success)`);
    }
    return result;
  } catch (error) {
    if (isDev) {
      console.debug(`[IPC ← Renderer] ${channel} (error): ${error.message}`);
    }
    throw error;
  }
};

// Wrap ipcRenderer.send for dev logging
const originalSend = ipcRenderer.send.bind(ipcRenderer);
ipcRenderer.send = (channel, ...args) => {
  if (isDev) {
    console.debug(`[IPC → Main] ${channel} (fire-and-forget)`, args);
  }
  return originalSend(channel, ...args);
};

/**
 * Preload script that exposes a secure API to the renderer process.
 * This replaces direct madden-franchise library access in the renderer.
 */

/**
 * Tracks wrapper functions so they can be properly removed.
 * ipcRenderer.removeListener requires the exact same function reference
 * that was passed to ipcRenderer.on, but we wrap callbacks in anonymous
 * functions. This Map stores the wrapper keyed by the original callback.
 */
const listenerWrappers = new Map();

/**
 * Registers a listener with a wrapper and tracks it for later removal.
 */
function addListener(channel, callback, wrapper) {
  if (typeof callback !== "function") return;
  listenerWrappers.set(callback, wrapper);
  ipcRenderer.on(channel, wrapper);
}

/**
 * Removes a previously registered listener by looking up its wrapper.
 */
function removeListener(channel, callback) {
  const wrapper = listenerWrappers.get(callback);
  if (wrapper) {
    ipcRenderer.removeListener(channel, wrapper);
    listenerWrappers.delete(callback);
  }
}

// Expose franchise API
contextBridge.exposeInMainWorld("franchiseAPI", {
  // File operations
  openFile: (filePath, options) =>
    ipcRenderer.invoke("franchise:open-file", filePath, options),
  closeFile: (fileId) => ipcRenderer.invoke("franchise:close-file", fileId),
  getMetadata: (fileId) => ipcRenderer.invoke("franchise:get-metadata", fileId),
  saveFile: (fileId, options) =>
    ipcRenderer.invoke("franchise:save-file", fileId, options),
  saveFileAs: (fileId, newPath) =>
    ipcRenderer.invoke("franchise:save-file-as", fileId, newPath),
  loadSchema: (fileId, schemaPath, saveSchema) =>
    ipcRenderer.invoke("franchise:load-schema", fileId, schemaPath, saveSchema),

  // Schema operations
  getSavedSchemas: () => ipcRenderer.invoke("franchise:get-saved-schemas"),
  saveSchemaData: (data, meta) =>
    ipcRenderer.invoke("franchise:save-schema-data", data, meta),
  generateSchema: (data) =>
    ipcRenderer.invoke("franchise:generate-schema", data),
  writeXmlSchema: (data, outputPath) =>
    ipcRenderer.invoke("schema:write-xml", data, outputPath),

  // Schema mismatch detection
  schemaMismatch: {
    check: (fileId) => ipcRenderer.invoke("schema-mismatch:check", fileId),
  },

  // Table operations
  readTableData: (fileId, tableId, fields) =>
    ipcRenderer.invoke("franchise:read-table-data", fileId, tableId, fields),
  writeTableCell: (fileId, tableId, recordIndex, fieldName, value) =>
    ipcRenderer.invoke(
      "franchise:write-table-cell",
      fileId,
      tableId,
      recordIndex,
      fieldName,
      value,
    ),
  getTableList: (fileId) =>
    ipcRenderer.invoke("franchise:get-table-list", fileId),
  findTablesByName: (fileId, tableName) =>
    ipcRenderer.invoke("franchise:find-tables-by-name", fileId, tableName),

  // Utility operations
  getUtilReferenceData: (epochValue) =>
    ipcRenderer.invoke("franchise:get-util-reference-data", epochValue),
  getRawContents: (fileId) =>
    ipcRenderer.invoke("franchise:get-raw-contents", fileId),
  getReferencesToRecord: (fileId, tableId, recordIndex) =>
    ipcRenderer.invoke(
      "franchise:get-references-to-record",
      fileId,
      tableId,
      recordIndex,
    ),

  // Schema viewer operations
  schemaViewer: {
    getFields: (fileId) =>
      ipcRenderer.invoke("schema-viewer:get-fields", fileId),
    getSchemaInfo: (fileId) =>
      ipcRenderer.invoke("schema-viewer:get-schema-info", fileId),
  },

  // Schedule operations
  schedule: {
    getStartTimes: (fileId) =>
      ipcRenderer.invoke("schedule:get-start-times", fileId),
  },

  // Event listeners (one-way from main to renderer)
  onFileReady: (callback) => {
    addListener("franchise:ready", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
  onFileError: (callback) => {
    addListener("franchise:error", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
  onFileSaving: (callback) => {
    addListener("franchise:saving", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
  onFileSaved: (callback) => {
    addListener("franchise:saved", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
  onTableChanged: (callback) => {
    addListener("franchise:table-changed", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },

  // Remove listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Expose app/dialog API (replaces @electron/remote usage)
contextBridge.exposeInMainWorld("electronAPI", {
  // Dialog operations
  showSaveDialog: (options) => ipcRenderer.invoke("dialog:show-save", options),
  showOpenDialog: (options) => ipcRenderer.invoke("dialog:show-open", options),
  showMessageBox: (options) =>
    ipcRenderer.invoke("dialog:show-message", options),

  // App info
  isDev,
  isTest,
  getUserDataPath: () => ipcRenderer.invoke("app:get-user-data-path"),
  getDocumentsPath: () => ipcRenderer.invoke("app:get-documents-path"),
  getVersion: () => ipcRenderer.invoke("app:get-version"),
  // IPC send (for existing channels)
  send: (channel, data) => ipcRenderer.send(channel, data),
  sendSync: (channel, data) => ipcRenderer.sendSync(channel, data),
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  },
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },

  // File system operations (replaces fs in renderer)
  fs: {
    readJson: (filename) => ipcRenderer.invoke("fs:read-json", filename),
    writeJson: (filename, data) =>
      ipcRenderer.invoke("fs:write-json", filename, data),
    exists: (filePath) => ipcRenderer.invoke("fs:exists", filePath),
    readFile: (filePath) => ipcRenderer.invoke("fs:read-file", filePath),
    readFileBase64: (filePath) =>
      ipcRenderer.invoke("fs:read-file-base64", filePath),
    writeFileBase64: (filePath, base64Data) =>
      ipcRenderer.invoke("fs:write-file-base64", filePath, base64Data),
    writeFile: (filePath, data) =>
      ipcRenderer.invoke("fs:write-file", filePath, data),
    mkdir: (dirPath) => ipcRenderer.invoke("fs:mkdir", dirPath),
    readdir: (dirPath) => ipcRenderer.invoke("fs:readdir", dirPath),
    exportTable: (filePath, base64Data) =>
      ipcRenderer.invoke("fs:export-table", filePath, base64Data),
    importTable: (filePath) => ipcRenderer.invoke("fs:import-table", filePath),
  },

  // Schedule operations
  schedules: {
    list: () => ipcRenderer.invoke("schedules:list"),
    read: (filename) => ipcRenderer.invoke("schedules:read", filename),
  },

  // External data operations (xlsx/csv import/export handled in main)
  externalData: {
    import: (filePath) => ipcRenderer.invoke("external-data:import", filePath),
    importBulk: (fileId, tableId, rows) =>
      ipcRenderer.invoke("external-data:import-bulk", fileId, tableId, rows),
    export: (filePath, headers, rows) =>
      ipcRenderer.invoke("external-data:export", filePath, headers, rows),
    rawExport: (fileId, tableId, filePath) =>
      ipcRenderer.invoke("external-data:export-raw", fileId, tableId, filePath),
    frtExport: (fileId, filePath) =>
      ipcRenderer.invoke("external-data:export-frt", fileId, filePath),
    rawImport: (fileId, tableId, filePath) =>
      ipcRenderer.invoke("external-data:import-raw", fileId, tableId, filePath),
  },

  // Preferences operations
  preferences: {
    get: () => ipcRenderer.invoke("preferences:get"),
    set: (prefs) => ipcRenderer.invoke("preferences:set", prefs),
    getValue: (keyPath) => ipcRenderer.invoke("preferences:get-value", keyPath),
    getDocumentsPath: () =>
      ipcRenderer.invoke("preferences:get-documents-path"),
    getSections: () => ipcRenderer.invoke("preferences:get-sections"),
  },

  // Recent files operations
  recentFiles: {
    initialize: () => ipcRenderer.invoke("recent-files:initialize"),
    addFile: (filePath) => ipcRenderer.invoke("recent-files:add", filePath),
    removeFile: (filePath) =>
      ipcRenderer.invoke("recent-files:remove", filePath),
    getRecentFiles: () => ipcRenderer.invoke("recent-files:get"),
  },

  // Schema operations
  schema: {
    initialize: () => ipcRenderer.invoke("schema:initialize"),
  },

  // Schema search operations
  schemaSearch: {
    search: (directories) =>
      ipcRenderer.invoke("schema-search:search", directories),
    getScanDirectories: (executablePath, mode) =>
      ipcRenderer.invoke(
        "schema-search:get-scan-directories",
        executablePath,
        mode,
      ),
    saveSchema: (data, meta) =>
      ipcRenderer.invoke("schema-search:save-schema", data, meta),
    getSavedSchemas: () =>
      ipcRenderer.invoke("schema-search:get-saved-schemas"),
    schemaExists: (meta) =>
      ipcRenderer.invoke("schema-search:schema-exists", meta),
    getSchemaDir: () => ipcRenderer.invoke("schema-search:get-schema-dir"),
    onProgress: (callback) => {
      addListener("schema-search:progress", callback, (_event, data) => {
        if (typeof callback === "function") callback(data);
      });
    },
    removeProgressListener: () => {
      ipcRenderer.removeAllListeners("schema-search:progress");
    },
  },

  // File change notifications
  onFileChanged: (callback) => {
    addListener("file-changed", callback, (_event, ...args) => {
      if (typeof callback === "function") callback(...args);
    });
  },

  // Update operations
  update: {
    check: () => ipcRenderer.send("update:check"),
    install: () => ipcRenderer.send("update:install"),
    openReleasePage: () => ipcRenderer.invoke("update:open-release-page"),
  },

  // Welcome screen operations
  welcome: {
    openFile: (filePath) => ipcRenderer.invoke("welcome:open-file", filePath),
    revealInExplorer: (filePath) =>
      ipcRenderer.invoke("welcome:reveal-in-explorer", filePath),
  },

  // Event listeners for file lifecycle
  onFileLoaded: (callback) => {
    addListener("file-loaded", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
  onCloseFile: (callback) => {
    addListener("close-file", callback, () => {
      if (typeof callback === "function") callback();
    });
  },
  onReloadFile: (callback) => {
    addListener("reload-file", callback, (_event, data) => {
      if (typeof callback === "function") callback(data);
    });
  },
  removeFileLoadedListener: (callback) => {
    removeListener("file-loaded", callback);
  },
  removeCloseFileListener: (callback) => {
    removeListener("close-file", callback);
  },
  removeReloadFileListener: (callback) => {
    removeListener("reload-file", callback);
  },
});
