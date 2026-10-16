// Schema path will be initialized async
let PATH_TO_SCHEMA_FILES = null;

const savedSchemaService = {};

savedSchemaService.initialize = async () => {
  // Get schema path from main process (handles directory creation)
  PATH_TO_SCHEMA_FILES = await window.electronAPI.schemaSearch.getSchemaDir();
};

savedSchemaService.getSavedSchemas = async () => {
  return await window.electronAPI.schemaSearch.getSavedSchemas();
};

savedSchemaService.schemaExists = async (meta) => {
  return await window.electronAPI.schemaSearch.schemaExists(meta);
};

savedSchemaService.saveSchema = (pathToSchema, meta) => {
  // This is now handled by the main process via IPC
  // Kept for backward compatibility but should use saveSchemaData instead
  console.warn("saveSchema is deprecated, use saveSchemaData instead");
};

savedSchemaService.saveSchemaData = async (data, meta) => {
  return await window.electronAPI.schemaSearch.saveSchema(data, meta);
};

savedSchemaService.getSchemaPath = () => {
  return PATH_TO_SCHEMA_FILES;
};

module.exports = savedSchemaService;
