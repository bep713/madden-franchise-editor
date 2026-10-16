const EventEmitter = require("events").EventEmitter;

let schemaSearchService = {};
schemaSearchService.eventEmitter = new EventEmitter();

/**
 * Search directories for schema files via IPC to main process.
 * @param {string[]} directoriesToSearch - Array of directory paths to scan
 * @returns {Promise<Array>} Array of schema objects with meta and data
 */
schemaSearchService.search = async (directoriesToSearch) => {
  if (!directoriesToSearch || !Array.isArray(directoriesToSearch)) {
    throw new Error("Invalid arguments: directoriesToSearch must be an array");
  }

  // Set up progress listener
  const progressHandler = (data) => {
    schemaSearchService.eventEmitter.emit(data.type, data);
  };

  window.electronAPI.schemaSearch.onProgress(progressHandler);

  try {
    const results =
      await window.electronAPI.schemaSearch.search(directoriesToSearch);
    return results;
  } finally {
    // Clean up progress listener
    window.electronAPI.schemaSearch.removeProgressListener();
  }
};

/**
 * Get directories to scan for schemas.
 * @param {string} executablePath - Path to the Madden executable
 * @param {string} mode - 'quick' or 'full' scan mode
 * @returns {Promise<string[]>} Array of directory paths to scan
 */
schemaSearchService.getScanDirectories = async (executablePath, mode) => {
  if (!executablePath || typeof executablePath !== "string") {
    throw new Error("Invalid arguments: executablePath must be a string");
  }
  return window.electronAPI.schemaSearch.getScanDirectories(
    executablePath,
    mode,
  );
};

/**
 * Save schema data to disk.
 * @param {Buffer} data - Schema data buffer
 * @param {object} meta - Schema metadata (gameYear, major, minor, fileExtension)
 * @returns {Promise<{success: boolean, path: string}>}
 */
schemaSearchService.saveSchema = async (data, meta) => {
  if (!data || !meta) {
    throw new Error("Invalid arguments: data and meta are required");
  }
  return window.electronAPI.schemaSearch.saveSchema(data, meta);
};

/**
 * Get list of saved schemas.
 * @returns {Promise<Array>} Array of schema metadata objects
 */
schemaSearchService.getSavedSchemas = async () => {
  return window.electronAPI.schemaSearch.getSavedSchemas();
};

/**
 * Check if a schema exists.
 * @param {object} meta - Schema metadata (gameYear, major, minor)
 * @returns {Promise<boolean>}
 */
schemaSearchService.schemaExists = async (meta) => {
  if (!meta) {
    throw new Error("Invalid arguments: meta is required");
  }
  return window.electronAPI.schemaSearch.schemaExists(meta);
};

/**
 * Get the schema directory path.
 * @returns {Promise<string>}
 */
schemaSearchService.getSchemaDir = async () => {
  return window.electronAPI.schemaSearch.getSchemaDir();
};

module.exports = schemaSearchService;
