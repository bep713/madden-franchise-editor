const schemaGenerationService = {};

/**
 * Generate schema data from raw block data.
 * @param {object} data - Schema block data
 * @returns {Promise<object>} Generated schema with meta and data properties
 */
schemaGenerationService.generate = async (data) => {
  if (!data) {
    throw new Error("Invalid arguments: data is required");
  }
  return await window.franchiseAPI.generateSchema(data);
};

/**
 * Generate schema and write to XML file.
 * All file operations (existence check, path renaming, writing) are handled in main process.
 * @param {object} data - Schema block data
 * @param {string} outputPath - Absolute path to write the schema file
 * @returns {Promise<{success: boolean, outputPath: string}>}
 */
schemaGenerationService.writeXmlSchema = async (data, outputPath) => {
  if (!data || !outputPath) {
    throw new Error("Invalid arguments: data and outputPath are required");
  }
  return await window.franchiseAPI.writeXmlSchema(data, outputPath);
};

module.exports = schemaGenerationService;
