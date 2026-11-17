// Builds schema .gz inputs for the add-schema tests.
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");

const TABLES = [
  {
    name: "GzTable",
    assetId: 9601,
    ownerAssetId: 0,
    numMembers: 1,
    base: "Record",
    attributes: [{ index: "0", name: "Flag", type: "bool", enum: null }],
  },
];

/**
 * Write a gzip JSON schema. meta null leaves the meta key out.
 * @param {object|null} meta
 * @param {object[]} [schemas]
 * @param {{ fileName?: string, dir?: string }} [options]
 * @returns {string} the file's path
 */
function makeSchemaGz(meta, schemas = TABLES, { fileName = "schema.gz", dir } = {}) {
  const out = dir ?? fs.mkdtempSync(path.join(os.tmpdir(), "mfe-gz-"));
  fs.mkdirSync(out, { recursive: true });
  const json = meta ? { meta, schemas } : { schemas };
  const filePath = path.join(out, fileName);
  fs.writeFileSync(filePath, zlib.gzipSync(JSON.stringify(json)));
  return filePath;
}

/** The parsed JSON of a schema .gz */
function readSchemaGz(filePath) {
  return JSON.parse(zlib.gunzipSync(fs.readFileSync(filePath)).toString());
}

module.exports = { makeSchemaGz, readSchemaGz, TABLES };
