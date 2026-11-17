// Builds the schema for a plan with canAdd, stages and validates it, then
// hands it to previous.replace. Every madden-franchise 4.4.1 workaround for
// this feature lives here.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { XMLValidator } = require("fast-xml-parser");
const { generateSchemaV2, FranchiseSchema } = require("madden-franchise");
const { includeKey } = require("./scan");
const { problem, databaseName } = require("./plan");
const previous = require("./previous");

const ZLIB_CHUNK_SIZE = 1024 * 1024;

/**
 * @param {import('../../../src/shared/types/addSchema').AddSchemaPlan} plan  canAdd is true
 * @param {import('./scan').FileScan[]} scans
 * @param {import('../../../src/shared/types/addSchema').AddSchemaCommit} commit
 * @param {object} port  see FranchiseFileManager.schemaImportPort
 * @returns {Promise<import('../../../src/shared/types/addSchema').AddSchemaResult>}
 */
async function buildAndCommit(plan, scans, commit, port) {
  const identity = {
    ...plan.options.game.value,
    major: plan.options.major.value,
    minor: plan.options.minor.value,
  };
  const built =
    plan.kind === "copy-gz"
      ? await buildCopy(scans.find((s) => s.format === "gz"), identity)
      : await buildGenerated(plan, scans, commit.includeDefaults, identity);
  if (built.problems.length) return blocked(plan, built.problems);

  await fs.promises.mkdir(port.stagingDir, { recursive: true });
  const staged = path.join(port.stagingDir, plan.target.fileName);
  await fs.promises.writeFile(staged, built.buffer);
  await validateStaged(staged);

  previous.replace(staged, plan.target, identity, port);
  port.invalidate([plan.target.path, ...plan.target.replaces.map((r) => r.path)]);

  const warnings = plan.problems
    .filter((p) => p.code === "version-guessed")
    .concat(
      plan.missing.length
        ? [problem("missing-includes-accepted", { files: plan.missing })]
        : [],
    );
  return {
    status: "added",
    added: {
      identity,
      fileName: plan.target.fileName,
      path: plan.target.path,
      replaced: plan.target.replaces.length > 0,
      loadedBy: plan.target.replaces.flatMap((r) => r.loadedBy),
      warnings,
    },
  };
}

function blocked(plan, problems) {
  return {
    status: "blocked",
    plan: { ...plan, problems: [...plan.problems, ...problems], canAdd: false },
  };
}

async function buildCopy(scan, identity) {
  const source = await fs.promises.readFile(scan.path);
  const m = scan.meta;
  const unchanged =
    m &&
    m.gameType === identity.gameType &&
    m.gameYear === identity.gameYear &&
    m.major === identity.major &&
    m.minor === identity.minor;
  return { buffer: unchanged ? source : withMeta(source, identity), problems: [] };
}

async function buildGenerated(plan, scans, includeDefaults, identity) {
  const used = plan.files.filter((f) => f.role === "entry" || f.role === "include");
  const problems = [];
  for (const f of used) {
    const result = XMLValidator.validate(await fs.promises.readFile(f.path, "utf8"), {
      allowBooleanAttributes: true,
    });
    if (result !== true) {
      const { msg, line } = result.err;
      problems.push(problem("malformed-xml", { path: f.path, detail: `Line ${line}: ${msg}` }));
    }
  }
  if (problems.length) return { problems };

  const fileMap = { main: plan.entry };
  for (const f of used) if (f.role === "include") fileMap[includeKey(f.name)] = f.path;
  const root = await generateSchemaV2({
    fileMap,
    extraSchemas: extraSchemasArg(includeDefaults),
  });
  const generated = checkGenerated(root);
  if (generated.length) return { problems: generated };

  return {
    buffer: serialize(root, { ...identity, databaseName: databaseName(scans) }),
    problems: [],
  };
}

/**
 * 4.4.1 has no "no defaults" switch: a missing or empty array loads
 * extra-schemas.json, while a non-array object skips the load and the merge.
 * @param {boolean} includeDefaults
 */
function extraSchemasArg(includeDefaults) {
  return includeDefaults ? undefined : {};
}

/**
 * The normalized gz shape FranchiseSchema.evaluateSchemaGzip reads:
 * attribute.enum is a name looked up in enumMap.
 */
function serialize(root, meta) {
  const { gameType, gameYear, major, minor, databaseName } = meta;
  const json = JSON.stringify({
    meta: { major, minor, gameYear, gameType, databaseName },
    schemas: root.schemas,
    enumMap: root.enumMap,
  });
  return zlib.gzipSync(json, { chunkSize: ZLIB_CHUNK_SIZE });
}

/** Rewrite a schema gz's meta with the chosen identity, keeping its other keys. */
function withMeta(gzBuffer, identity) {
  const json = JSON.parse(zlib.gunzipSync(gzBuffer, { chunkSize: ZLIB_CHUNK_SIZE }).toString());
  const { gameType, gameYear, major, minor } = identity;
  json.meta = { ...json.meta, gameType, gameYear, major, minor };
  return zlib.gzipSync(JSON.stringify(json), { chunkSize: ZLIB_CHUNK_SIZE });
}

/**
 * What only a full generation shows. An attribute typed with an enum that has
 * no members crashes FranchiseEnum's copy constructor at load.
 */
function checkGenerated(root) {
  if (!root.schemas.length) return [problem("no-tables")];
  const empty = new Set();
  for (const schema of root.schemas) {
    for (const attr of schema.attributes ?? []) {
      const name = typeof attr?.enum === "string" ? attr.enum : null;
      // A name missing from enumMap (an extra schema's) loads as an empty enum
      if (name && root.enumMap[name] && !root.enumMap[name].members.length) empty.add(name);
    }
  }
  return empty.size ? [problem("empty-enum", { detail: [...empty].join(", ") })] : [];
}

/** Load the staged file the way an open does. Throws when it doesn't load. */
async function validateStaged(stagedPath) {
  const schema = new FranchiseSchema(stagedPath);
  await new Promise((resolve, reject) => {
    schema.once("schemas:done", resolve);
    try {
      schema.evaluate();
    } catch (err) {
      reject(err);
    }
  });
  if (!schema.schemas?.length) throw new Error("The saved schema has no tables");
}

module.exports = {
  buildAndCommit,
  extraSchemasArg,
  serialize,
  withMeta,
  checkGenerated,
  validateStaged,
};
