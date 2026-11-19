/**
 * v5 add-schema IPC. Each handler returns { error } on an unexpected failure.
 * @param {object} loggedIpc
 * @param {import('../services/schemaImport').SchemaImporter} importer
 */
function registerSchemaImportHandlers(loggedIpc, importer) {
  const handle = (channel, fn) =>
    loggedIpc.handle(channel, async (event, arg) => {
      try {
        return await fn(arg);
      } catch (err) {
        console.error(`${channel} failed:`, err);
        return { error: err?.message || String(err) };
      }
    });
  handle("schema:inspect-add", (request) => importer.inspect(request));
  handle("schema:add", (commit) => importer.add(commit));
  handle("schema:restore-previous", () => importer.restorePrevious());
}

module.exports = { registerSchemaImportHandlers };
