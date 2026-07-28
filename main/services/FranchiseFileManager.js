const {
  FranchiseFile,
  schemaPicker,
  schemaGenerator,
  utilService,
  FranchiseFileRecord,
} = require("madden-franchise");
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { Readable } = require("stream");

/**
 * Manages FranchiseFile instances in the main process.
 * Renderer communicates via IPC using fileId references.
 */
class FranchiseFileManager {
  constructor() {
    /** @type {Map<string, { file: FranchiseFile, path: string }>} */
    this.activeFiles = new Map();
    this._nextFileId = 1;
    this._schemaDirectory = path.join(app.getPath("userData"), "schemas");
    this._preferencesProvider = null;
    this._ensureSchemaDirectory();
    this._loggedIpc = {};
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
    const autoSave =
      options.autoSave ??
      this._isPreferenceEnabled(preferences?.general?.autoSave);
    const autoUnempty =
      options.autoUnempty ??
      this._isPreferenceEnabled(preferences?.general?.autoUnempty);

    const settings = {
      autoParse: true,
      autoUnempty,
      saveOnChange: autoSave,
      schemaDirectory: options.schemaDirectory || this._schemaDirectory,
    };

    if (options.schemaOverride) {
      settings.schemaOverride = options.schemaOverride;
    }

    return settings;
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
      saveOnChange: this._isPreferenceEnabled(
        resolvedPreferences?.general?.autoSave,
      ),
    };
  }

  /**
   * Apply current preferences to all active files.
   * @param {object} preferences
   * @returns {{ updatedFileCount: number }}
   */
  applyPreferenceSettings(preferences = null) {
    this.activeFiles.forEach(({ file }) => {
      this._applyPreferencesToFile(file, preferences);
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

    return new Promise((resolve, reject) => {
      const file = new FranchiseFile(filePath, settings);
      const fileId = metaOptions.fileId ?? this._generateFileId();

      file.once("error", (err) => {
        reject(err);
      });

      file.on("ready", () => {
        file.off("error", reject);
        this._applyPreferencesToFile(file);

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
        });

        // Set up change event forwarding
        file.on("change", (table) => {
          this._emitToFileWindows(fileId, "franchise:table-changed", {
            fileId,
            tableId: table.header.tableId,
            name: table.name,
          });
        });

        // forward the saving and saved events to main
        file.on("saving", () => this._loggedIpc?.emit("saving"));
        file.on("saved", () => this._loggedIpc?.emit("saved"));

        const metadata = this._buildMetadata(file);
        resolve({ fileId, metadata });
      });
    });
  }

  /**
   * Close a franchise file
   * @param {string} fileId
   * @returns {boolean}
   */
  closeFile(fileId) {
    return this.activeFiles.delete(fileId);
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
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const { file } = entry;

    return new Promise((resolve, reject) => {
      const savePromise = options.sync
        ? Promise.resolve(file.save(null, { sync: true }))
        : file.save();

      savePromise
        .then(() => {
          resolve(file.filePath || entry.path);
        })
        .catch(reject);
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

    entry.file.filePath = newPath;
    entry.path = newPath;
    return this.saveFile(fileId, {});
  }

  /**
   * Reload file with a different schema
   * @param {string} fileId
   * @param {string} schemaPath
   * @param {boolean} saveSchema - Whether to save the schema
   * @returns {Promise<object>}
   */
  async loadSchema(fileId, schemaPath, saveSchema = false) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const { file } = entry;
    const { metadata } = await this.openFile(
      entry.path,
      {
        ...file.settings,
        schemaDirectory: this._schemaDirectory,
        schemaOverride: { path: schemaPath },
      },
      {
        fileId,
      },
    );

    return { status: "successful", metadata };
  }

  /**
   * Save schema for a file
   * @param {FranchiseFile} file
   * @param {string} schemaPath
   * @private
   */
  _saveSchemaForFile(file, schemaPath) {
    const meta = {
      gameYear: file.schemaList.meta.gameYear,
      major: file.schemaList.meta.major,
      minor: file.schemaList.meta.minor,
      fileExtension: path.extname(file.schemaList.path),
    };

    const destPath = path.join(
      this._schemaDirectory,
      `M${meta.gameYear}_${meta.major}_${meta.minor}${meta.fileExtension}`,
    );

    fs.createReadStream(schemaPath).pipe(fs.createWriteStream(destPath));
  }

  /**
   * Get saved schemas
   * @returns {Array<object>}
   */
  getSavedSchemas() {
    console.log(`Saved schemas: ${this._schemaDirectory}`);
    return schemaPicker.retrieveSchemas(this._schemaDirectory);
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
    const LZ4 = require("lz4-napi");
    let uncompressed = Buffer.alloc(0);

    data.blocks.forEach((block) => {
      let uncompressedBlock = Buffer.alloc(block.meta.size);
      let uncompressedSize = LZ4.decodeBlock(block.data, uncompressedBlock);
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
    };
  }

  /**
   * Write a value to a table cell
   * @param {string} fileId
   * @param {number} tableId
   * @param {number} recordIndex
   * @param {string} fieldName
   * @param {*} value
   * @returns {Promise<void>}
   */
  async writeTableCell(fileId, tableId, recordIndex, fieldName, value) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const table = entry.file.getTableById(tableId);
    if (!table) {
      throw new Error(`Table not found: ${tableId}`);
    }

    if (!table.records[recordIndex]) {
      throw new Error(`Record not found: ${recordIndex}`);
    }

    const previousMeta = this._serializeRecordMeta(
      table.records[recordIndex],
      recordIndex,
    );

    table.records[recordIndex][fieldName] = value;

    const cellErrors = {};
    const updatedRecord = this._serializeRecord(
      table.records[recordIndex],
      recordIndex,
      cellErrors,
    );
    const updatedMeta = this._serializeRecordMeta(
      table.records[recordIndex],
      recordIndex,
    );
    const emptyRecordIndices = this._serializeEmptyRecordIndices(
      table.emptyRecords,
    );

    return {
      record: updatedRecord,
      recordMeta: updatedMeta,
      previousRecordMeta: previousMeta,
      emptyRecordIndices,
      emptyRecords: emptyRecordIndices.map((index) => ({
        index,
        record: this._serializeRecord(table.records[index]),
      })),
      cellErrors: cellErrors[recordIndex] || null,
    };
  }

  /**
   * Set one or more records as empty for a table.
   * @param {string} fileId
   * @param {number} tableId
   * @param {number[]} recordIndices
   * @returns {Promise<object>}
   */
  async setTableRecordsEmpty(fileId, tableId, recordIndices = []) {
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

    table.recalculateEmptyRecordReferences();

    const emptyRecordIndices = this._serializeEmptyRecordIndices(
      table.emptyRecords,
    );

    return {
      affectedCount: uniqueIndices.length,
      emptyRecordIndices,
      emptyRecords: emptyRecordIndices.map((index) => ({
        index,
        record: this._serializeRecord(table.records[index]),
      })),
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
   * Get raw file contents for backup
   * @param {string} fileId
   * @returns {Buffer|null}
   */
  getRawContents(fileId) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) return null;
    return entry.file.rawContents;
  }

  /**
   * Get all records that reference a specific record.
   * Falls back to a manual scan when the library helper is unavailable.
   * @param {string} fileId
   * @param {number} tableId
   * @param {number} recordIndex
   * @returns {Promise<Array<{tableId: number, name: string, recordIndex: number, fieldName?: string}>>}
   */
  async getReferencesToRecord(fileId, tableId, recordIndex) {
    const entry = this.activeFiles.get(fileId);
    if (!entry) {
      throw new Error(`File not found: ${fileId}`);
    }

    const file = entry.file;
    if (typeof file.getReferencesToRecord === "function") {
      const result = file.getReferencesToRecord(tableId, recordIndex);
      // Ensure the result is a plain array of plain objects
      if (Array.isArray(result)) {
        return result.map((ref) => ({
          tableId: Number(ref.tableId),
          name: String(ref.name),
          recordIndex: Number(ref.recordIndex),
          fieldName: ref.fieldName ? String(ref.fieldName) : undefined,
        }));
      }
      return [];
    }

    const targetTableId = Number(tableId);
    const targetRecordIndex = Number(recordIndex);
    const references = [];
    const seen = new Set();

    for (const table of file.tables || []) {
      const referenceHeaders = (table.offsetTable || []).filter(
        (header) => header && header.isReference,
      );

      if (referenceHeaders.length === 0) {
        continue;
      }

      try {
        await table.readRecords();
      } catch (error) {
        console.warn(`Failed to read records for table ${table.name}:`, error);
        continue;
      }

      if (!Array.isArray(table.records)) {
        continue;
      }

      table.records.forEach((record, sourceRecordIndex) => {
        if (!record) return;

        for (const header of referenceHeaders) {
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
          const referencedRecordIndex = Number(referenceData.recordIndex);

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
          return await this.openFile(filePath, options);
        } catch (err) {
          return { error: err.message };
        }
      },
    );

    loggedIpc.handle("franchise:close-file", async (event, fileId) => {
      return this.closeFile(fileId);
    });

    loggedIpc.handle("franchise:get-metadata", async (event, fileId) => {
      return this.getFileMetadata(fileId);
    });

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
      "franchise:load-schema",
      async (event, fileId, schemaPath, saveSchema) => {
        try {
          return await this.loadSchema(fileId, schemaPath, saveSchema);
        } catch (err) {
          return { error: err.message };
        }
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
      "franchise:write-table-cell",
      async (event, fileId, tableId, recordIndex, fieldName, value) => {
        try {
          const result = await this.writeTableCell(
            fileId,
            tableId,
            recordIndex,
            fieldName,
            value,
          );
          return { success: true, ...result };
        } catch (err) {
          return { error: err.message };
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

    loggedIpc.handle("franchise:get-raw-contents", async (event, fileId) => {
      const contents = this.getRawContents(fileId);
      if (contents) {
        return { data: contents.toString("base64") };
      }
      return { error: "File not found" };
    });

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
