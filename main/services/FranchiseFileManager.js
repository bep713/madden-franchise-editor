const {
  FranchiseFile,
  schemaPicker,
  schemaGenerator,
  utilService,
  FranchiseFileRecord,
  FranchiseSchema,
} = require("madden-franchise");
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Readable } = require("stream");
const { decodeBlock } = require("../libs/lz4Block");
const startupProfiler = require("./startupProfiler");
const { detectFormat } = require("../utils/detectFormat");
const { checkSchemaMismatch } = require("../handlers/schemaMismatchHandler");

/**
 * Manages FranchiseFile instances in the main process.
 * Renderer communicates via IPC using fileId references.
 */
class FranchiseFileManager {
  constructor() {
    // changeCount/savedCount: change events seen, and the count at the last
    // save to the entry's own path (see hasUnsavedChanges)
    /** @type {Map<string, { file: FranchiseFile, path: string, autoSave: boolean, changeCount: number, savedCount: number }>} */
    this.activeFiles = new Map();
    // fileId -> tail of that file's task queue (see _runExclusive). Keyed by
    // fileId because loadSchema replaces the activeFiles entry.
    /** @type {Map<string, Promise<void>>} */
    this._fileQueues = new Map();
    // fileId -> { pending } where pending is a queued auto-save that hasn't started
    /** @type {Map<string, { pending: Promise<void>|null }>} */
    this._autoSaves = new Map();
    this._nextFileId = 1;
    this._schemaDirectory = path.join(app.getPath("userData"), "schemas");
    this._preferencesProvider = null;
    this._ensureSchemaDirectory();
    this._loggedIpc = {};
    this._notificationStore = null;
  }

  /**
   * Set the notification store the open/load/close hooks write to.
   * @param {object|null} store
   */
  setNotificationStore(store) {
    this._notificationStore = store || null;
  }

  /**
   * Register a preferences provider used for file-level settings.
   * @param {Function|null} provider
   */
  setPreferencesProvider(provider) {
    this._preferencesProvider =
      typeof provider === "function" ? provider : null;
  }

  /**
   * Get the latest preferences snapshot, if available.
   * @returns {object|null}
   * @private
   */
  _getPreferences() {
    if (!this._preferencesProvider) {
      return null;
    }

    try {
      return this._preferencesProvider() || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Normalize checkbox-based preference values into booleans.
   * @param {*} value
   * @returns {boolean}
   * @private
   */
  _isPreferenceEnabled(value) {
    if (Array.isArray(value)) {
      return value.includes(true);
    }

    return Boolean(value);
  }

  /**
   * Build file settings for a franchise file from open options and preferences.
   * @param {object} options
   * @returns {object}
   * @private
   */
  _buildFileSettings(options = {}) {
    const preferences = this._getPreferences();
    const autoUnempty =
      options.autoUnempty ??
      this._isPreferenceEnabled(preferences?.general?.autoUnempty);

    const settings = {
      autoParse: true,
      autoUnempty,
      // The library's saveOnChange is always off; requestAutoSave saves instead
      saveOnChange: false,
      schemaDirectory: options.schemaDirectory || this._schemaDirectory,
    };

    if (options.schemaOverride) {
      settings.schemaOverride = options.schemaOverride;
    }

    if (
      options.gameYearOverride !== undefined &&
      options.gameYearOverride !== null
    ) {
      settings.gameYearOverride = options.gameYearOverride;
    }

    if (
      options.gameTypeOverride !== undefined &&
      options.gameTypeOverride !== null
    ) {
      settings.gameTypeOverride = options.gameTypeOverride;
    }

    return settings;
  }

  /**
   * Resolve whether a file auto-saves: the open option wins over the preference.
   * @param {object} options
   * @returns {boolean}
   * @private
   */
  _resolveAutoSave(options = {}) {
    return (
      options.autoSave ??
      this._isPreferenceEnabled(this._getPreferences()?.general?.autoSave)
    );
  }

  /**
   * Apply managed editor preferences to a loaded file instance.
   * @param {FranchiseFile} file
   * @param {object} preferences
   * @returns {void}
   * @private
   */
  _applyPreferencesToFile(file, preferences = null) {
    if (!file) {
      return;
    }

    const resolvedPreferences = preferences || this._getPreferences();

    file.settings = {
      ...(file.settings || {}),
      autoUnempty: this._isPreferenceEnabled(
        resolvedPreferences?.general?.autoUnempty,
      ),
      saveOnChange: false,
    };
  }

  /**
   * Apply current preferences to all active files.
   * @param {object} preferences
   * @returns {{ updatedFileCount: number }}
   */
  applyPreferenceSettings(preferences = null) {
    const resolvedPreferences = preferences || this._getPreferences();
    const autoSave = this._isPreferenceEnabled(
      resolvedPreferences?.general?.autoSave,
    );
    this.activeFiles.forEach((entry) => {
      this._applyPreferencesToFile(entry.file, resolvedPreferences);
      entry.autoSave = autoSave;
    });

    return { updatedFileCount: this.activeFiles.size };
  }

  /**
   * Initialize schema directory
   * @private
   */
  _ensureSchemaDirectory() {
    if (!fs.existsSync(this._schemaDirectory)) {
      fs.mkdirSync(this._schemaDirectory, { recursive: true });
    }
  }

  /**
   * Generate a unique file ID
   * @returns {string}
   */
  _generateFileId() {
    return `franchise_${this._nextFileId++}`;
  }

  /**
   * Create a renderer-safe placeholder for a cell that could not be read.
   * @returns {string}
   */
  _getUnreadableCellPlaceholder() {
    return "Error loading cell";
  }

  /**
   * Normalize thrown values into a readable message.
   * @param {*} error
   * @returns {string}
   */
  _getErrorMessage(error) {
    return error?.message || String(error);
  }

  /**
   * Serialize a single record into a renderer-safe plain object.
   * @param {FranchiseFileRecord} record
   * @param {number} recordIndex
   * @param {object} cellErrors
   * @returns {object}
   * @private
   */
  _serializeRecord(record, recordIndex, cellErrors = {}) {
    return record.fieldsArray.reduce((accum, field) => {
      try {
        accum[field.key] = field.value;

        if (!field.value && field.offset.valueInThirdTable) {
          accum[field.key] = "[empty]";
        }
      } catch (error) {
        if (!cellErrors[recordIndex]) {
          cellErrors[recordIndex] = {};
        }

        cellErrors[recordIndex][field.key] = this._getErrorMessage(error);
        accum[field.key] = this._getUnreadableCellPlaceholder();
      }

      return accum;
    }, {});
  }

  /**
   * Serialize renderer-relevant metadata for a single record.
   * @param {object} record
   * @param {number} recordIndex
   * @returns {object}
   * @private
   */
  _serializeRecordMeta(record, recordIndex) {
    return {
      index: recordIndex,
      isEmpty: Boolean(record?.isEmpty),
    };
  }

  /**
   * Convert table.emptyRecords into a stable array of record indices.
   * @param {*} emptyRecords
   * @returns {number[]}
   * @private
   */
  _serializeEmptyRecordIndices(emptyRecords) {
    if (!emptyRecords) {
      return [];
    }

    if (emptyRecords instanceof Map) {
      return Array.from(emptyRecords.keys())
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b);
    }

    if (emptyRecords instanceof Set) {
      return Array.from(emptyRecords)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b);
    }

    if (Array.isArray(emptyRecords)) {
      return emptyRecords
        .map((value, index) => {
          if (typeof value === "number") return value;
          if (value && typeof value === "object") {
            if (Number.isInteger(value.recordIndex)) return value.recordIndex;
            if (Number.isInteger(value.index)) return value.index;
          }
          return Number.isInteger(index) ? index : null;
        })
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b);
    }

    if (typeof emptyRecords === "object") {
      return Object.keys(emptyRecords)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value))
        .sort((a, b) => a - b);
    }

    return [];
  }

  /**
   * Serialize a table's empty-record state (indices plus each empty record).
   * @param {object} table
   * @returns {{emptyRecordIndices: number[], emptyRecords: Array<{index: number, record: object}>}}
   * @private
   */
  _serializeEmptyState(table) {
    const emptyRecordIndices = this._serializeEmptyRecordIndices(
      table.emptyRecords,
    );
    return {
      emptyRecordIndices,
      emptyRecords: emptyRecordIndices.map((index) => ({
        index,
        record: this._serializeRecord(table.records[index]),
      })),
    };
  }

  /**
   * Open a franchise file
   * @param {string} filePath - Absolute path to the file
   * @param {object} options - Options for opening the file
   * @param {string} [options.schemaDirectory] - Custom schema directory
   * @param {object} [options.schemaOverride] - Override schema path
   * @param {object} metaOptions - Options strictly related to the FranchiseFileManager
   * @param {string} [metaOptions.fileId] - Use this id as the file's id, do not generate a new one
   * @returns {Promise<{ fileId: string, metadata: object }>}
   */
  async openFile(filePath, options = {}, metaOptions = {}) {
    const settings = this._buildFileSettings(options);
    const autoSave = this._resolveAutoSave(options);

    return new Promise((resolve, reject) => {
      startupProfiler.mark("open:parse-start");
      const file = new FranchiseFile(filePath, settings);
      const fileId = metaOptions.fileId ?? this._generateFileId();

      file.once("error", (err) => {
        reject(err);
      });

      file.on("ready", () => {
        startupProfiler.mark("open:parse-ready");
        file.off("error", reject);
        this._applyPreferencesToFile(file);
        startupProfiler.mark("open:prefs-applied");

        // Assume m22 if no game year is set
        if (!file._gameYear) {
          file._gameYear = 22;
        }
        if (!file.type.year) {
          file.type.year = 22;
        }

        this.activeFiles.set(fileId, {
          file,
          path: filePath,
          autoSave,
          changeCount: 0,
          savedCount: 0,
        });

        // Set up change event forwarding
        file.on("change", (table) => {
          const current = this.activeFiles.get(fileId);
          if (current?.file !== file) return; // closed or replaced by a reload
          current.changeCount++; // quiet writes count too
          this.requestAutoSave(fileId);
          if (current.suppressChangeEvents) return;
          this._emitToFileWindows(fileId, "franchise:table-changed", {
            fileId,
            tableId: table.header.tableId,
            name: table.name,
          });
        });

        // forward the saving and saved events to main
        file.on("saving", () => this._loggedIpc?.emit?.("saving"));
        file.on("saved", () => this._loggedIpc?.emit?.("saved"));

        // Back up the original bytes on user-initiated opens only
        // (internal reopens pass an existing fileId)
        if (!metaOptions.fileId) {
          startupProfiler.mark("open:backup-start");
          this._backupFile(file);
        }

        const metadata = this._buildMetadata(file);
        resolve({ fileId, metadata });
      });
    });
  }

  /**
   * Write the file's original on-disk bytes to a single backup file.
   * Fire-and-forget: errors are logged, never thrown.
   * @param {FranchiseFile} file
   */
  _backupFile(file) {
    const backupDir = path.join(app.getPath("userData"), "backup");
    fs.promises
      .mkdir(backupDir, { recursive: true })
      .then(() =>
        fs.promises.writeFile(
          path.join(backupDir, "backup.bak"),
          file.rawContents,
        ),
      )
      .then(() => startupProfiler.mark("open:backup-end"))
      .catch((err) => {
        console.warn("Failed to backup file:", err);
      });
  }

  /**
   * Close a franchise file
   * @param {string} fileId
   * @returns {boolean}
   */
  closeFile(fileId) {
    // Queued tasks keep their own file reference and finish
    this._fileQueues.delete(fileId);
    this._autoSaves.delete(fileId);
    return this.activeFiles.delete(fileId);
  }

  /**
   * Run fn after every earlier task for this file has settled. File writes,
   * saves and reloads go through here so they never interleave.
   * @template T
   * @param {string} fileId
   * @param {() => T|Promise<T>} fn
   * @returns {Promise<T>}
   */
  _runExclusive(fileId, fn) {
    const tail = this._fileQueues.get(fileId) || Promise.resolve();
    const result = tail.then(() => fn());
    // the stored tail never rejects, so one failure doesn't block the queue
    this._fileQueues.set(fileId, result.catch(() => {}));
    return result;
  }

  /**
   * Queue a save if the file auto-saves. Requests made before the queued save
   * starts share it. Save errors are logged, never thrown.
   * @param {string} fileId
   * @returns {Promise<void>}
   */
  requestAutoSave(fileId) {
    const entry = this.activeFiles.get(fileId);
    if (!entry?.autoSave) return Promise.resolve();

    let state = this._autoSaves.get(fileId);
    if (!state) {
      state = { pending: null };
      this._autoSaves.set(fileId, state);
    }
    if (state.pending) return state.pending;

    const pending = this._runExclusive(fileId, async () => {
      // requests from now on need a new save
      state.pending = null;
      const current = this.activeFiles.get(fileId);
      if (!current?.autoSave) return;
      await this._saveFileUnlocked(fileId);
    }).catch((error) => {
      console.error(`Auto-save failed for ${fileId}:`, error);
    });
    state.pending = pending;
    return pending;
  }

  /**
   * Get file metadata
   * @param {string} fileId
   * @returns {object|null}
   */
  getFileMetadata(fileId) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) return null;
    return this._buildMetadata(entry.file);
  }

  /**
   * Get an active franchise file by ID.
   * @param {string} fileId
   * @returns {FranchiseFile|null}
   */
  getFile(fileId) {
    const entry = this.activeFiles.get(fileId);
    return entry ? entry.file : null;
  }

  /**
   * Build metadata object from FranchiseFile
   * @param {FranchiseFile} file
   * @returns {object}
   */
  _buildMetadata(file) {
    const metadata = this._buildMetadataUntimed(file);
    if (startupProfiler.enabled) {
      startupProfiler.mark("open:metadata-built", {
        tableCount: metadata.tableCount,
        bytes: Buffer.byteLength(JSON.stringify(metadata)),
      });
    }
    return metadata;
  }

  _buildMetadataUntimed(file) {
    return {
      gameYear: file._gameYear,
      type: file.type,
      format: file.type?.format,
      isLoaded: file.isLoaded,
      expectedSchemaVersion: file.expectedSchemaVersion,
      schemaList: file.schemaList
        ? {
            meta: file.schemaList.meta,
            path: file.schemaList.path,
          }
        : null,
      tableCount: file.tables ? file.tables.length : 0,
      tables: file.tables
        ? file.tables.map((t) => ({
            id: t.header.tableId,
            name: t.name,
            recordCount: t.header.data1RecordCount,
            isArray: t.isArray,
          }))
        : [],
    };
  }

  /**
   * Save the file
   * @param {string} fileId
   * @param {object} options
   * @param {boolean} [options.sync] - Use synchronous save
   * @returns {Promise<string>}
   */
  async saveFile(fileId, options = {}) {
    return this._runExclusive(fileId, () =>
      this._saveFileUnlocked(fileId, options),
    );
  }

  async _saveFileUnlocked(fileId, options = {}) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const { file } = entry;
    const savePath = options.path;
    // a copy to another path leaves the file on disk unchanged
    const savesOwnPath = !savePath || savePath === entry.path;
    const changeCount = entry.changeCount;

    await (options.sync
      ? file.save(savePath, { sync: true })
      : file.save(savePath));
    if (savesOwnPath) {
      // a change made during the save keeps the file dirty
      entry.savedCount = changeCount;
    }
    return file.filePath || entry.path;
  }

  /**
   * Whether the file has changes since it was opened or last saved to its own
   * path. Waits for queued writes and saves first. Undos count as changes.
   * @param {string} fileId
   * @returns {Promise<boolean>}
   */
  async hasUnsavedChanges(fileId) {
    return this._runExclusive(fileId, () => {
      const entry = this.activeFiles.get(fileId);
      return !!entry && entry.changeCount !== entry.savedCount;
    });
  }

  /**
   * Save file to a new path
   * @param {string} fileId
   * @param {string} newPath
   * @returns {Promise<string>}
   */
  async saveFileAs(fileId, newPath) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    return this.saveFile(fileId, { path: newPath });
  }

  /**
   * Save file to a new path and open it at the new path
   * @param {string} fileId
   * @param {string} newPath
   * @returns {Promise<string>}
   */
  async saveFileAsAndOpen(fileId, newPath) {
    return this._runExclusive(fileId, () => {
      const entry = this.activeFiles.get(fileId);
      if (!entry) {
        throw new Error(`File not found: ${fileId}`);
      }

      entry.file.filePath = newPath;
      entry.path = newPath;
      return this._saveFileUnlocked(fileId, {});
    });
  }

  /**
   * Reload file with a different schema
   * @param {string} fileId
   * @param {string} schemaPath
   * @param {boolean} saveSchema - Whether to save the schema
   * @returns {Promise<object>}
   */
  async loadSchema(fileId, schemaPath, saveSchema = false) {
    return this._runExclusive(fileId, () =>
      this._loadSchemaUnlocked(fileId, schemaPath, saveSchema),
    );
  }

  async _loadSchemaUnlocked(fileId, schemaPath, saveSchema) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const { file } = entry;
    const { metadata } = await this.openFile(
      entry.path,
      {
        ...file.settings,
        autoSave: entry.autoSave,
        schemaDirectory: this._schemaDirectory,
        schemaOverride: { path: schemaPath },
      },
      {
        fileId,
      },
    );

    if (saveSchema) {
      const { file: reloadedFile } = this.activeFiles.get(fileId);
      if (reloadedFile.schemaList?.meta) {
        await this._saveSchema(reloadedFile.schemaList.meta, schemaPath);
      } else {
        console.warn(`Schema loaded but has no meta; not saved: ${schemaPath}`);
      }
    }

    return { status: "successful", metadata };
  }

  /**
   * Save a schema file to the schema directory without loading it into the
   * open file. Also reports whether it exactly matches the schema version
   * the open file expects.
   * @param {string} fileId
   * @param {string} schemaPath
   * @returns {Promise<{meta: {gameYear: number, major: number, minor: number}, savedPath: string, matchesExpected: boolean}>}
   */
  async addSchema(fileId, schemaPath) {
    const schema = new FranchiseSchema(schemaPath);
    await new Promise((resolve, reject) => {
      // Listen before evaluate(); the .gz path emits synchronously
      schema.once("schemas:done", resolve);
      try {
        schema.evaluate();
      } catch (err) {
        reject(err);
      }
    });

    if (!schema.meta) {
      throw new Error("Schema file has no version information");
    }
    const { gameYear, major, minor } = schema.meta;
    const savedPath = await this._saveSchema(
      { gameYear, major, minor },
      schemaPath,
    );

    const expected = this.activeFiles.get(fileId)?.file.expectedSchemaVersion;
    const matchesExpected =
      !!expected &&
      expected.major === major &&
      expected.minor === minor &&
      (expected.gameYear === undefined ||
        expected.gameYear === null ||
        expected.gameYear === gameYear);

    return { meta: { gameYear, major, minor }, savedPath, matchesExpected };
  }

  /**
   * Copy a schema file into the schema directory, named by its game year and version
   * @param {{gameYear: number, major: number, minor: number}} meta - Schema version info
   * @param {string} schemaPath - Path of the schema file to copy
   * @returns {Promise<string>} Path of the saved schema file
   * @private
   */
  async _saveSchema(meta, schemaPath) {
    const { gameYear, major, minor } = meta;
    const fileExtension = path.extname(schemaPath);

    await fs.promises.mkdir(this._schemaDirectory, { recursive: true });
    const destPath = path.join(
      this._schemaDirectory,
      `M${gameYear}_${major}_${minor}${fileExtension}`,
    );

    await fs.promises.copyFile(schemaPath, destPath);
    return destPath;
  }

  /**
   * Whether a path is inside the custom schema directory (not the directory itself)
   * @param {string} p
   * @returns {boolean}
   * @private
   */
  _isInSchemaDirectory(p) {
    const rel = path.relative(this._schemaDirectory, path.resolve(p));
    // path.relative returns an absolute path for another drive
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  }

  /**
   * Get the bundled and custom schemas, each tagged with its source
   * @returns {Array<{gameType: string|null, gameYear: number|null, major: number, minor: number, path: string, source: "bundled"|"custom"}>}
   */
  getSavedSchemas() {
    // retrieveSchemas throws if the custom dir is missing
    this._ensureSchemaDirectory();
    return schemaPicker
      .retrieveSchemas(this._schemaDirectory)
      .map((schema) => ({
        ...schema,
        source: this._isInSchemaDirectory(schema.path) ? "custom" : "bundled",
      }));
  }

  /**
   * Delete a custom schema file. Refuses bundled schemas, anything outside the
   * schema directory, folders, and a schema an open file has loaded.
   * @param {string} schemaPath
   * @returns {Promise<void>}
   */
  async deleteSchema(schemaPath) {
    const resolved = path.resolve(schemaPath);
    if (!this._isInSchemaDirectory(resolved)) {
      throw new Error(`Not a custom schema: ${schemaPath}`);
    }
    const stats = await fs.promises.stat(resolved);
    if (!stats.isFile()) {
      throw new Error(`Not a schema file: ${schemaPath}`);
    }

    const key = resolved.toLowerCase();
    for (const { file } of this.activeFiles.values()) {
      const loadedPath = file.schemaList?.path;
      if (loadedPath && path.resolve(loadedPath).toLowerCase() === key) {
        throw new Error(`Schema is loaded by an open file: ${schemaPath}`);
      }
    }

    await fs.promises.unlink(resolved);
  }

  /**
   * Save schema data
   * @param {Buffer} data
   * @param {object} meta
   * @returns {Promise<void>}
   */
  saveSchemaData(data, meta) {
    return new Promise((resolve, reject) => {
      const filename = `M${meta.gameYear}_${meta.major}_${meta.minor}${meta.fileExtension}`;
      const destPath = path.join(this._schemaDirectory, filename);

      fs.writeFile(destPath, data, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Generate schema from raw data
   * @param {object} data - Schema block data
   * @returns {Promise<object>}
   */
  generateSchema(data) {
    return new Promise((resolve, reject) => {
      try {
        const uncompressedSchema = this._generateUncompressedSchema(data);

        const readable = new Readable();
        readable._read = () => {};
        readable.push(uncompressedSchema);
        readable.push(null);

        schemaGenerator.generateFromStream(readable);

        schemaGenerator.eventEmitter.once("schemas:done", (root) => {
          const newData = {
            meta: root.meta,
            schemas: root.schemas,
          };

          const compressedData = zlib.gzipSync(JSON.stringify(newData));

          resolve({
            meta: {
              gameYear: root.meta.gameYear,
              major: root.meta.major,
              minor: root.meta.minor,
              fileExtension: ".gz",
            },
            data: compressedData,
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Generate uncompressed schema from block data
   * @param {object} data
   * @returns {Buffer}
   * @private
   */
  _generateUncompressedSchema(data) {
    let uncompressed = Buffer.alloc(0);

    data.blocks.forEach((block) => {
      let uncompressedBlock = Buffer.alloc(block.meta.size);
      const uncompressedSize = decodeBlock(block.data, uncompressedBlock);
      if (uncompressedSize < 0) {
        throw new Error(
          `LZ4 block decode failed at input byte ${-uncompressedSize}`,
        );
      }
      uncompressedBlock = uncompressedBlock.slice(0, uncompressedSize);
      uncompressed = Buffer.concat([uncompressed, uncompressedBlock]);
    });

    return uncompressed;
  }

  /**
   * Get utility reference data
   * @param {number} epochValue
   * @returns {object}
   */
  getUtilReferenceData(epochValue) {
    return utilService.getReferenceData(epochValue);
  }

  /**
   * Read table records
   * @param {string} fileId
   * @param {number} tableId
   * @param {Array<string>} [fields] - Specific fields to read
   * @returns {Promise<object>}
   */
  async readTableData(fileId, tableId, fields = null) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const table = entry.file.getTableById(tableId);
    if (!table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    await table.readRecords(fields);

    const cellErrors = {};
    const records = table.records.map((record, recordIndex) =>
      this._serializeRecord(record, recordIndex, cellErrors),
    );
    const recordMeta = table.records.map((record, recordIndex) =>
      this._serializeRecordMeta(record, recordIndex),
    );

    return {
      tableId: table.header.tableId,
      uniqueId: table.header.uniqueId,
      header: { ...table.header },
      name: table.name,
      recordCount: table.records.length,
      records,
      recordMeta,
      emptyRecordIndices: this._serializeEmptyRecordIndices(table.emptyRecords),
      cellErrors,
      headers: table.offsetTable
        ? table.offsetTable.map((o) => ({
            name: o.name,
            type: o.type,
            offset: o.offset,
            isReference: o.isReference || false,
            valueInThirdTable: o.valueInThirdTable || false,
            maxLength: o.maxLength || null,
            length: o.length || 0,
            enum: o.enum
              ? {
                  name: o.enum.name,
                  members: o.enum.members.map((m) => ({
                    name: m.name,
                    value: m.value,
                  })),
                }
              : null,
          }))
        : [],
      usingGenericSchema:
        table.offsetTable.filter((o) => !o.name.startsWith("Field")).length ===
        0,
    };
  }

  /**
   * Writes a single cell. Does not serialize anything; callers build the response.
   * @param {string} fileId
   * @param {number} tableId
   * @param {number} recordIndex
   * @param {string} fieldName
   * @param {*} value
   * @returns {{ table: object, wasEmpty: boolean }}
   */
  writeTableCell(fileId, tableId, recordIndex, fieldName, value) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const table = entry.file.getTableById(tableId);
    if (!table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    const record = table.records[recordIndex];
    if (!record) {
      throw new Error(`Record not found: ${recordIndex}`);
    }

    const wasEmpty = Boolean(record.isEmpty);
    record[fieldName] = value;
    return { table, wasEmpty };
  }

  /**
   * Writes many table cells at once. Records are serialized once per unique
   * row and empty-record state once per table, instead of once per cell.
   * @param {string} fileId
   * @param {Array<object>} changes
   * @returns {Promise<{results: Array<object>, records: Array<object>, emptyStates: Array<object>}>}
   */
  async writeBulkTableCells(fileId, changes) {
    return this._runExclusive(fileId, () =>
      this._writeBulkTableCellsUnlocked(fileId, changes),
    );
  }

  async _writeBulkTableCellsUnlocked(fileId, changes) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    entry.suppressChangeEvents = true; // coalesced table-changed events are sent below

    const results = [];
    const touchedRows = new Map(); // `${tableId}:${recordIndex}` -> {table, tableId, recordIndex, wasEmpty}
    const YIELD_EVERY = 500;

    try {
      for (let index = 0; index < changes.length; index++) {
        const { tableId, recordIndex, fieldName, value } = changes[index];
        try {
          const { table, wasEmpty } = this.writeTableCell(
            fileId,
            tableId,
            recordIndex,
            fieldName,
            value,
          );
          const key = `${tableId}:${recordIndex}`;
          if (!touchedRows.has(key)) {
            // keep the state from the FIRST write to this row
            touchedRows.set(key, { table, tableId, recordIndex, wasEmpty });
          }
          results.push({ success: true, index });
        } catch (err) {
          results.push({
            success: false,
            index,
            error: err?.message || String(err),
          });
        }

        if ((index + 1) % YIELD_EVERY === 0) {
          // let the main process handle other events during big batches
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
    } finally {
      entry.suppressChangeEvents = false;
    }

    // Serialize once per unique row
    const records = [];
    const unemptiedTables = new Map();
    const changedTables = new Map();
    for (const {
      table,
      tableId,
      recordIndex,
      wasEmpty,
    } of touchedRows.values()) {
      const record = table.records[recordIndex];
      const cellErrors = {};
      const recordMeta = this._serializeRecordMeta(record, recordIndex);
      records.push({
        tableId,
        recordIndex,
        record: this._serializeRecord(record, recordIndex, cellErrors),
        recordMeta,
        previousRecordMeta: { index: recordIndex, isEmpty: wasEmpty },
        cellErrors: cellErrors[recordIndex] || null,
      });
      changedTables.set(tableId, table);
      if (wasEmpty && !recordMeta.isEmpty) {
        unemptiedTables.set(tableId, table);
      }
    }

    // Empty-record state: once per table, and only if a row was un-emptied
    const emptyStates = [];
    for (const [tableId, table] of unemptiedTables) {
      emptyStates.push({ tableId, ...this._serializeEmptyState(table) });
    }

    // One coalesced change event per table instead of one per field set
    for (const table of changedTables.values()) {
      this._emitToFileWindows(fileId, "franchise:table-changed", {
        fileId,
        tableId: table.header.tableId,
        name: table.name,
      });
    }

    // The library's change events already queued an auto-save behind this
    // write; the response doesn't wait for it
    return { results, records, emptyStates };
  }

  /**
   * Set one or more records as empty for a table.
   * @param {string} fileId
   * @param {number} tableId
   * @param {number[]} recordIndices
   * @returns {Promise<object>}
   */
  async setTableRecordsEmpty(fileId, tableId, recordIndices = []) {
    return this._runExclusive(fileId, () =>
      this._setTableRecordsEmptyUnlocked(fileId, tableId, recordIndices),
    );
  }

  async _setTableRecordsEmptyUnlocked(fileId, tableId, recordIndices) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const table = entry.file.getTableById(tableId);
    if (!table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    if (!Array.isArray(recordIndices) || recordIndices.length === 0) {
      return {
        affectedCount: 0,
        emptyRecordIndices: this._serializeEmptyRecordIndices(
          table.emptyRecords,
        ),
      };
    }

    await table.readRecords();

    const uniqueIndices = Array.from(new Set(recordIndices))
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0);

    uniqueIndices.forEach((recordIndex) => {
      if (!table.records[recordIndex]) {
        throw new Error(`Record not found: ${recordIndex}`);
      }

      if (!table.records[recordIndex].isEmpty) {
        table.records[recordIndex].empty();
      }
    });

    return {
      affectedCount: uniqueIndices.length,
      ...this._serializeEmptyState(table),
    };
  }

  /**
   * Point a table's empty-record chain at an already-empty record. Records
   * before it drop out of the chain. A non-empty record would make the
   * library read its first 4 bytes as the next pointer, so it is rejected.
   * @param {string} fileId
   * @param {number} tableId
   * @param {number} recordIndex
   * @returns {Promise<object>}
   */
  async setTableNextRecordToUse(fileId, tableId, recordIndex) {
    return this._runExclusive(fileId, () =>
      this._setTableNextRecordToUseUnlocked(fileId, tableId, recordIndex),
    );
  }

  async _setTableNextRecordToUseUnlocked(fileId, tableId, recordIndex) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const table = entry.file.getTableById(tableId);
    if (!table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    await table.readRecords();

    const index = Number(recordIndex);
    const record = Number.isInteger(index) ? table.records[index] : undefined;
    if (!record) {
      throw new Error(`Record not found: ${recordIndex}`);
    }
    if (!record.isEmpty) {
      throw new Error(`Record ${index} is not empty`);
    }

    table.setNextRecordToUse(index, true);
    // The library re-parses the chain but leaves isEmpty set on records that
    // dropped out of it
    table.records.forEach((r, i) => {
      if (r.isEmpty && !table.emptyRecords.has(i)) {
        r.isEmpty = false;
      }
    });

    return {
      nextRecordToUse: table.header.nextRecordToUse,
      ...this._serializeEmptyState(table),
    };
  }

  /**
   * Get table list
   * @param {string} fileId
   * @returns {Array<object>}
   */
  getTableList(fileId) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    return entry.file.tables.map((t) => ({
      id: t.header.tableId,
      uniqueId: t.header.uniqueId,
      name: t.name,
      recordCount: t.header.data1RecordCount,
      isArray: t.isArray,
    }));
  }

  /**
   * Find tables by name
   * @param {string} fileId
   * @param {string} tableName - Table name to search for
   * @returns {Array<{id: number, name: string, recordCount: number}>}
   */
  findTablesByName(fileId, tableName) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const tables = entry.file.getAllTablesByName(tableName);
    return tables.map((t) => ({
      id: t.header.tableId,
      name: t.name,
      recordCount: t.header.data1RecordCount,
    }));
  }

  /**
   * Get all records that reference a specific record, one per referencing
   * record and field.
   * @param {string} fileId
   * @param {number} tableId
   * @param {number} recordIndex
   * @returns {Promise<Array<{tableId: number, name: string, recordIndex: number, fieldName?: string, fieldIndex?: number}>>}
   */
  async getReferencesToRecord(fileId, tableId, recordIndex) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    // The library's FranchiseFile.getReferencesToRecord only finds the
    // tables whose schema can reference the record and whose data holds its
    // reference bytes, with no record index. Scan those for the records.
    const file = entry.file;
    const targetTableId = Number(tableId);
    const targetRecordIndex = Number(recordIndex);
    const references = [];
    const seen = new Set();

    const candidates =
      typeof file.getReferencesToRecord === "function"
        ? (file.getReferencesToRecord(targetTableId, targetRecordIndex) || [])
            .map((ref) => ref.table)
            .filter(Boolean)
        : file.tables || [];

    for (const table of candidates) {
      // offsetTable is only filled in once the records are read
      try {
        await table.readRecords();
      } catch (error) {
        console.warn(`Failed to read records for table ${table.name}:`, error);
        continue;
      }

      // With their offsetTable index, which is the field's column in
      // readTableData's headers
      const referenceHeaders = (table.offsetTable || [])
        .map((header, index) => ({ header, index }))
        .filter(({ header }) => header && header.isReference);

      if (referenceHeaders.length === 0) {
        continue;
      }

      if (!Array.isArray(table.records)) {
        continue;
      }

      table.records.forEach((record, sourceRecordIndex) => {
        if (!record) return;

        for (const { header, index: fieldIndex } of referenceHeaders) {
          let referenceData;

          try {
            referenceData = record.getReferenceDataByKey(header.name);
          } catch (error) {
            continue;
          }

          if (!referenceData) {
            continue;
          }

          const referencedTableId = Number(referenceData.tableId);
          // The library calls the record index rowNumber
          const referencedRecordIndex = Number(referenceData.rowNumber);

          if (
            referencedTableId === targetTableId &&
            referencedRecordIndex === targetRecordIndex
          ) {
            const key = `${table.header.tableId}:${sourceRecordIndex}:${header.name}`;
            if (!seen.has(key)) {
              seen.add(key);
              // Create a plain object with only serializable properties
              references.push({
                tableId: Number(table.header.tableId),
                name: String(table.name),
                recordIndex: Number(sourceRecordIndex),
                fieldName: String(header.name),
                fieldIndex,
              });
            }
            break;
          }
        }
      });
    }

    return references;
  }

  /**
   * Emit an event to all windows that have a file loaded
   * @param {string} fileId
   * @param {string} channel
   * @param {any} data
   * @private
   */
  _emitToFileWindows(fileId, channel, data) {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send(channel, data);
    });
  }

  /**
   * Add a schema-mismatch notification if the file's loaded schema is not the
   * one it expects.
   * @param {string} fileId
   * @private
   */
  _notifyIfSchemaMismatch(fileId) {
    if (!this._notificationStore) return;
    const file = this.activeFiles.get(fileId)?.file;
    if (!file) return;
    const { hasMismatch, expected, used } = checkSchemaMismatch(file);
    if (!hasMismatch) return;
    this._notificationStore.add({
      kind: "schema-mismatch",
      fileId,
      data: {
        expected,
        loaded: used,
        gameType: file.type?.gameType || "madden",
      },
    });
  }

  /**
   * Build the open-file error result. Adds code "schema-not-found" when the
   * file's expected schema version has no schema in the bundled or custom
   * directory, the lookup the library's parse() does.
   * @param {Error} err
   * @param {string} filePath
   * @param {object} [options]
   * @returns {Promise<{ error: string, code?: "schema-not-found" }>}
   * @private
   */
  async _openError(err, filePath, options) {
    try {
      const probe = await FranchiseFile.create(filePath, {
        autoParse: false,
        gameYearOverride: options?.gameYearOverride ?? undefined,
        gameTypeOverride: options?.gameTypeOverride ?? undefined,
      });
      const expected = probe.expectedSchemaVersion;
      if (expected) {
        let picked = null;
        try {
          picked = schemaPicker.pick(
            probe._gameYear,
            expected.major,
            expected.minor,
            {
              schemaDirectory:
                options?.schemaDirectory || this._schemaDirectory,
            },
            probe._gameType,
          );
        } catch (pickError) {
          // pick throws a TypeError (reduce of an empty list) when no schema
          // exists for the game year. Anything else, like an unreadable
          // schema directory, is not a missing schema.
          if (!(pickError instanceof TypeError)) return { error: err.message };
        }
        if (!picked) return { error: err.message, code: "schema-not-found" };
      }
    } catch {
      // unreadable file: fall through to the plain error
    }
    return { error: err.message };
  }

  /**
   * Set up IPC handlers for the franchise manager
   * @param {Object} loggedIpc - Wrapped IPC with dev logging
   */
  registerIpcHandlers(loggedIpc) {
    this._loggedIpc = loggedIpc;

    // File operations
    loggedIpc.handle(
      "franchise:open-file",
      async (event, filePath, options) => {
        try {
          const result = await this.openFile(filePath, options);
          if (!options?.schemaOverride) {
            this._notifyIfSchemaMismatch(result.fileId);
          }
          return result;
        } catch (err) {
          if (options?.schemaOverride) return { error: err.message };
          return await this._openError(err, filePath, options);
        }
      },
    );

    loggedIpc.handle("franchise:close-file", async (event, fileId) => {
      this._notificationStore?.removeWhere((n) => n.fileId === fileId);
      return this.closeFile(fileId);
    });

    loggedIpc.handle("franchise:get-metadata", async (event, fileId) => {
      return this.getFileMetadata(fileId);
    });

    loggedIpc.handle(
      "franchise:get-metadata-from-file-path",
      async (event, filePath) => {
        startupProfiler.mark("open:handler-prepass-start");
        // Only `format` is needed here; sniff the header instead of parsing.
        let format = await detectFormat(filePath);
        if (!format) {
          const tempFile = await FranchiseFile.create(filePath, {
            autoParse: false,
          });
          format = tempFile.type?.format;
        }
        startupProfiler.mark("open:handler-prepass-end", { format });
        return { format };
      },
    );

    loggedIpc.handle("franchise:save-file", async (event, fileId, options) => {
      try {
        const path = await this.saveFile(fileId, options);
        return { path };
      } catch (err) {
        return { error: err.message };
      }
    });

    loggedIpc.handle(
      "franchise:save-file-as",
      async (event, fileId, newPath) => {
        try {
          const path = await this.saveFileAs(fileId, newPath);
          return { path };
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:save-file-as-and-open",
      async (event, fileId, newPath) => {
        try {
          const path = await this.saveFileAsAndOpen(fileId, newPath);
          return { path };
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:load-schema",
      async (event, fileId, schemaPath, saveSchema) => {
        try {
          const result = await this.loadSchema(fileId, schemaPath, saveSchema);
          this._notificationStore?.removeWhere(
            (n) => n.kind === "schema-mismatch" && n.fileId === fileId,
          );
          return result;
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:add-schema",
      async (event, fileId, schemaPath) => {
        try {
          return await this.addSchema(fileId, schemaPath);
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:has-unsaved-changes",
      async (event, fileId) => {
        return this.hasUnsavedChanges(fileId);
      },
    );

    // Schema operations
    loggedIpc.handle("franchise:get-saved-schemas", async () => {
      return this.getSavedSchemas();
    });

    loggedIpc.handle(
      "franchise:save-schema-data",
      async (event, data, meta) => {
        try {
          await this.saveSchemaData(data, meta);
          return { success: true };
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle("franchise:generate-schema", async (event, data) => {
      try {
        return await this.generateSchema(data);
      } catch (err) {
        return { error: err.message };
      }
    });

    // Table operations
    loggedIpc.handle(
      "franchise:read-table-data",
      async (event, fileId, tableId, fields) => {
        try {
          return await this.readTableData(fileId, tableId, fields);
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:write-bulk-table-cells",
      async (event, fileId, changes) => {
        try {
          const { results, records, emptyStates } =
            await this.writeBulkTableCells(fileId, changes);
          return { success: true, results, records, emptyStates };
        } catch (err) {
          return { success: false, error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:set-table-records-empty",
      async (event, fileId, tableId, recordIndices) => {
        try {
          const result = await this.setTableRecordsEmpty(
            fileId,
            tableId,
            recordIndices,
          );
          return { success: true, ...result };
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle(
      "franchise:set-table-next-record-to-use",
      async (event, fileId, tableId, recordIndex) => {
        try {
          const result = await this.setTableNextRecordToUse(
            fileId,
            tableId,
            recordIndex,
          );
          return { success: true, ...result };
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle("franchise:get-table-list", async (event, fileId) => {
      try {
        return this.getTableList(fileId);
      } catch (err) {
        return { error: err.message };
      }
    });

    loggedIpc.handle(
      "franchise:find-tables-by-name",
      async (event, fileId, tableName) => {
        try {
          return this.findTablesByName(fileId, tableName);
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    // Utility operations
    loggedIpc.handle(
      "franchise:get-util-reference-data",
      async (event, epochValue) => {
        return this.getUtilReferenceData(epochValue);
      },
    );

    // Reference lookup operations
    loggedIpc.handle(
      "franchise:get-references-to-record",
      async (event, fileId, tableId, recordIndex) => {
        try {
          const references = await this.getReferencesToRecord(
            fileId,
            tableId,
            recordIndex,
          );
          return { data: references };
        } catch (err) {
          return { error: err.message };
        }
      },
    );
  }
}

// Export singleton instance
const franchiseFileManager = new FranchiseFileManager();
module.exports = franchiseFileManager;
