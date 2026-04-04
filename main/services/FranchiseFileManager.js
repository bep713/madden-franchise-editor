const {
  FranchiseFile,
  schemaPicker,
  schemaGenerator,
  utilService,
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
    this._ensureSchemaDirectory();
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
   * Open a franchise file
   * @param {string} filePath - Absolute path to the file
   * @param {object} options - Options for opening the file
   * @param {string} [options.schemaDirectory] - Custom schema directory
   * @param {object} [options.schemaOverride] - Override schema path
   * @returns {Promise<{ fileId: string, metadata: object }>}
   */
  async openFile(filePath, options = {}) {
    const settings = {
      schemaDirectory: options.schemaDirectory || this._schemaDirectory,
      autoParse: true,
    };

    if (options.schemaOverride) {
      settings.schemaOverride = options.schemaOverride;
    }

    return new Promise((resolve, reject) => {
      const file = new FranchiseFile(filePath, settings);
      const fileId = this._generateFileId();

      file.once("error", (err) => {
        reject(err);
      });

      file.on("ready", () => {
        file.off("error", reject);

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
      file.emit("saving");

      const savePromise = options.sync
        ? Promise.resolve(file.save(null, { sync: true }))
        : file.save();

      savePromise
        .then(() => {
          file.emit("saved");
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
    return this.saveFile(fileId);
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

    return new Promise((resolve, reject) => {
      // Create new file instance with schema override
      const newFile = new FranchiseFile(entry.path, {
        schemaDirectory: this._schemaDirectory,
        schemaOverride: { path: schemaPath },
      });

      newFile.once("error", (err) => {
        reject(err);
      });

      newFile.on("ready", () => {
        newFile.off("error", reject);

        // Replace the old file reference
        entry.file = newFile;

        // Re-setup change event forwarding
        newFile.on("change", (table) => {
          this._emitToFileWindows(fileId, "franchise:table-changed", {
            fileId,
            tableId: table.header.tableId,
            name: table.name,
          });
        });

        // Optionally save the schema
        if (saveSchema && newFile.schemaList) {
          this._saveSchemaForFile(newFile, schemaPath);
        }

        const metadata = this._buildMetadata(newFile);
        resolve({ status: "successful", metadata });
      });
    });
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

    return {
      tableId: table.header.tableId,
      name: table.name,
      recordCount: table.records.length,
      records: table.records.map((r) => r.values),
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

    table.records[recordIndex].setValue(fieldName, value);
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
          await this.writeTableCell(
            fileId,
            tableId,
            recordIndex,
            fieldName,
            value,
          );
          return { success: true };
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
          const file = this.getFile(fileId);
          if (!file) {
            return { error: "File not found" };
          }
          const references = file.getReferencesToRecord(tableId, recordIndex);
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
