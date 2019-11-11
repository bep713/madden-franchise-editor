const fs = require('fs');
const path = require('path');

const remote = require('electron').remote;
const app = remote.app;

const schemaPicker = require('madden-franchise/services/schemaPicker');

const PATH_TO_SCHEMA_FILES = path.join(app.getPath('userData'), 'schemas');

let savedSchemaService = {};

savedSchemaService.initialize = () => {
  if (!fs.existsSync(PATH_TO_SCHEMA_FILES)) {
    fs.mkdirSync(PATH_TO_SCHEMA_FILES);
  }
};

savedSchemaService.getSavedSchemas = () => {
  return schemaPicker.retrieveSchemas(PATH_TO_SCHEMA_FILES);
};

savedSchemaService.saveSchema = (pathToSchema, meta) => {
  fs.createReadStream(pathToSchema).pipe(fs.createWriteStream(path.join(PATH_TO_SCHEMA_FILES, `M${meta.gameYear}_${meta.major}_${meta.minor}${meta.fileExtension}`)));
};

savedSchemaService.getSchemaPath = () => {
  return PATH_TO_SCHEMA_FILES;
};

module.exports = savedSchemaService;