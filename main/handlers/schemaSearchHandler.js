const path = require("path");
const fs = require("fs").promises;
const { app } = require("electron");
const { Readable } = require("stream");
const { pipeline } = require("stream");
const CASBlockParser = require("../libs/CASBlockParser");

const { wrapSenderSend } = require("../utils/ipcLogger");

/**
 * Registers IPC handlers for schema search operations.
 * Moves schema search logic from renderer to main process.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {FranchiseFileManager} franchiseFileManager
 */
function registerSchemaSearchHandlers(loggedIpc, franchiseFileManager) {
  /**
   * Get schema directory path and ensure it exists.
   */
  loggedIpc.handle("schema-search:get-schema-dir", async () => {
    try {
      const schemaDir = path.join(app.getPath("userData"), "schemas");
      await fs.mkdir(schemaDir, { recursive: true });
      return schemaDir;
    } catch (error) {
      throw new Error(`Failed to get schema directory: ${error.message}`);
    }
  });

  /**
   * Save schema data to disk.
   */
  loggedIpc.handle("schema-search:save-schema", async (event, data, meta) => {
    try {
      if (!data || !meta) {
        throw new Error("Invalid arguments: data and meta are required");
      }

      const schemaDir = path.join(app.getPath("userData"), "schemas");
      await fs.mkdir(schemaDir, { recursive: true });

      const filename = `M${meta.gameYear}_${meta.major}.${meta.minor}${meta.fileExtension || ".gz"}`;
      const filePath = path.join(schemaDir, filename);

      // Check if file exists and adjust path if needed
      let finalPath = filePath;
      try {
        await fs.access(filePath);
        const ext = path.extname(filePath);
        const base = filePath.slice(0, -ext.length);
        finalPath = `${base}_1${ext}`;
      } catch {
        // File doesn't exist, use original path
      }

      await fs.writeFile(finalPath, data);
      return { success: true, path: finalPath };
    } catch (error) {
      throw new Error(`Failed to save schema: ${error.message}`);
    }
  });

  /**
   * Get list of saved schemas.
   */
  loggedIpc.handle("schema-search:get-saved-schemas", async () => {
    try {
      const schemaDir = path.join(app.getPath("userData"), "schemas");
      await fs.mkdir(schemaDir, { recursive: true });

      const files = await fs.readdir(schemaDir);
      const schemas = [];

      for (const file of files) {
        const match = file.match(/^M(\d+)_(\d+)\.(\d+)(\.\w+)$/);
        if (match) {
          schemas.push({
            gameYear: parseInt(match[1], 10),
            major: parseInt(match[2], 10),
            minor: parseInt(match[3], 10),
            fileExtension: match[4],
            path: path.join(schemaDir, file),
            filename: file,
          });
        }
      }

      return schemas;
    } catch (error) {
      throw new Error(`Failed to get saved schemas: ${error.message}`);
    }
  });

  /**
   * Check if a schema exists.
   */
  loggedIpc.handle("schema-search:schema-exists", async (event, meta) => {
    try {
      if (!meta) {
        throw new Error("Invalid arguments: meta is required");
      }

      const schemaDir = path.join(app.getPath("userData"), "schemas");
      await fs.mkdir(schemaDir, { recursive: true });

      const files = await fs.readdir(schemaDir);
      const exists = files.some((file) => {
        const match = file.match(/^M(\d+)_(\d+)\.(\d+)(\.\w+)$/);
        if (!match) return false;
        return (
          parseInt(match[1], 10) === meta.gameYear &&
          parseInt(match[2], 10) === meta.major &&
          parseInt(match[3], 10) === meta.minor
        );
      });

      return exists;
    } catch (error) {
      throw new Error(`Failed to check schema existence: ${error.message}`);
    }
  });

  /**
   * Get directories to scan for schemas.
   * Returns all package directories under Data and Patch folders.
   */
  loggedIpc.handle(
    "schema-search:get-scan-directories",
    async (event, executablePath, mode) => {
      try {
        if (!executablePath || typeof executablePath !== "string") {
          throw new Error("Invalid arguments: executablePath must be a string");
        }

        const gameDirectory = path.dirname(executablePath);
        const dirsToSearch = ["Data", "Patch"];
        let allDirs = [];

        for (const dir of dirsToSearch) {
          const patchDirectory = path.join(gameDirectory, dir);
          const patchBundle = path.join(
            patchDirectory,
            "Win32/superbundlelayout",
          );

          const exists = await fs
            .stat(patchBundle)
            .then(() => true)
            .catch(() => false);

          if (exists) {
            const folders = await fs.readdir(patchBundle);
            allDirs = allDirs.concat(
              folders.map((folder) => path.join(patchBundle, folder)),
            );
          }
        }

        if (mode === "quick") {
          // For quick scan, prefer patch package_00, then data package_00, then first available
          const firstPatchPackage = allDirs.find((dir) => {
            return (
              dir.toLowerCase().includes("patch") &&
              dir.toLowerCase().includes("package_00")
            );
          });

          if (firstPatchPackage) {
            return [firstPatchPackage];
          }

          const firstDataDirectory = allDirs.find((dir) => {
            return (
              dir.toLowerCase().includes("data") &&
              dir.toLowerCase().includes("package_00")
            );
          });

          if (firstDataDirectory) {
            return [firstDataDirectory];
          }

          return allDirs.length > 0 ? [allDirs[0]] : [];
        }

        return allDirs;
      } catch (error) {
        throw new Error(`Failed to get scan directories: ${error.message}`);
      }
    },
  );

  /**
   * Search directories for schema files.
   * Scans all .gz files in the given directories, parses CAS blocks,
   * and extracts schema data.
   */
  loggedIpc.handle(
    "schema-search:search",
    async (event, directoriesToSearch) => {
      try {
        if (!directoriesToSearch || !Array.isArray(directoriesToSearch)) {
          throw new Error(
            "Invalid arguments: directoriesToSearch must be an array",
          );
        }

        const allSchemas = [];

        for (const directory of directoriesToSearch) {
          try {
            const schemas = await readInstallPackageFiles(
              directory,
              event,
              franchiseFileManager,
            );
            allSchemas.push(...schemas);
          } catch (err) {
            console.warn(`Error scanning directory ${directory}:`, err);
          } finally {
            wrapSenderSend(event).send("schema-search:progress", {
              type: "directory-done",
              directory,
            });
          }
        }

        return allSchemas;
      } catch (error) {
        throw new Error(`Failed to search for schemas: ${error.message}`);
      }
    },
  );
}

/**
 * Read and scan all files in a directory for schemas.
 */
async function readInstallPackageFiles(directory, event, franchiseFileManager) {
  const itemsInDir = await fs.readdir(directory);
  const files = [];

  for (const item of itemsInDir) {
    try {
      const fullPath = path.join(directory, item);
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        files.push(item);
      }
    } catch (err) {
      console.warn(err);
    }
  }

  wrapSenderSend(event).send("schema-search:progress", {
    type: "directory-scan",
    fileCount: files.length,
  });

  const allSchemas = [];

  for (const file of files) {
    try {
      const schemas = await getSchemasInFile(
        path.join(directory, file),
        franchiseFileManager,
      );
      allSchemas.push(...schemas);
    } catch (err) {
      console.warn(`Error processing file ${file}:`, err);
    } finally {
      wrapSenderSend(event).send("schema-search:progress", {
        type: "file-done",
        file,
      });
    }
  }

  return allSchemas;
}

/**
 * Parse a single file and extract all schemas from CAS blocks.
 */
async function getSchemasInFile(file, franchiseFileManager) {
  return new Promise((resolve, reject) => {
    const schemas = [];
    const schemaPromises = [];
    const parser = new CASBlockParser();
    const schemaStartCheck = Buffer.from([
      0x65, 0x2d, 0x53, 0x63, 0x68, 0x65, 0x6d, 0x61, 0x73,
    ]);

    parser.on("chunk", (chunk) => {
      if (
        chunk.blocks.length > 0 &&
        chunk.blocks[0].meta.compressionType ===
          CASBlockParser.COMPRESSION_TYPE.LZ4_BLOCK &&
        chunk.blocks[0].data.indexOf(schemaStartCheck) > -1
      ) {
        schemaPromises.push(
          new Promise(async (resolve, reject) => {
            try {
              const data = await franchiseFileManager.generateSchema(chunk);
              resolve({
                meta: {
                  gameYear: data.meta.gameYear,
                  major: data.meta.major,
                  minor: data.meta.minor,
                  fileExtension: ".gz",
                },
                data: data.data,
              });
            } catch (err) {
              reject(err);
            }
          }),
        );
      }
    });

    fs.readFile(file)
      .then((fileBuffer) => {
        const readStream = new Readable();
        readStream.push(fileBuffer);
        readStream.push(null);

        pipeline(readStream, parser, async (err) => {
          if (err) {
            reject(err);
            return;
          }

          try {
            const results = await Promise.all(schemaPromises);
            resolve(results);
          } catch (err) {
            reject(err);
          }
        });
      })
      .catch(reject);
  });
}

module.exports = { registerSchemaSearchHandlers };
