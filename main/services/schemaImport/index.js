// The only module of this folder that code outside it may require.
const fs = require("fs");
const path = require("path");
const games = require("../../../data/games.json");
const { scanAll } = require("./scan");
const { planAdd } = require("./plan");
const { buildAndCommit } = require("./commit");
const previous = require("./previous");

const isString = (v) => typeof v === "string";
const isStringArray = (v) => Array.isArray(v) && v.every(isString);
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

/** Shape-check an untrusted AddSchemaRequest. Throws when it is malformed. */
function parseRequest(raw) {
  if (!isObject(raw) || !isStringArray(raw.files) || typeof raw.includeDefaults !== "boolean") {
    throw new Error("Invalid add-schema request");
  }
  if (!raw.files.every((f) => f && path.isAbsolute(f))) {
    throw new Error("Invalid add-schema request: files must be absolute paths");
  }
  const o = raw.overrides ?? {};
  const validGame =
    o.game === undefined ||
    (isObject(o.game) && ["madden", "college"].includes(o.game.gameType) && isString(o.game.year));
  if (
    !isObject(o) ||
    !validGame ||
    !(o.major === undefined || isString(o.major)) ||
    !(o.minor === undefined || isString(o.minor))
  ) {
    throw new Error("Invalid add-schema request: overrides");
  }
  const overrides = {};
  if (o.game !== undefined) overrides.game = { gameType: o.game.gameType, year: o.game.year };
  if (o.major !== undefined) overrides.major = o.major;
  if (o.minor !== undefined) overrides.minor = o.minor;
  return { files: [...raw.files], overrides, includeDefaults: raw.includeDefaults };
}

function parseCommit(raw) {
  const request = parseRequest(raw);
  const t = raw.confirmedTarget;
  if (
    !isStringArray(raw.acceptMissing) ||
    !isObject(t) ||
    !isString(t.fileName) ||
    !isStringArray(t.replaces)
  ) {
    throw new Error("Invalid add-schema commit");
  }
  return {
    ...request,
    acceptMissing: [...raw.acceptMissing],
    confirmedTarget: { fileName: t.fileName, replaces: [...t.replaces] },
  };
}

class SchemaImporter {
  /** @param {ReturnType<import('../FranchiseFileManager')['schemaImportPort']>} port */
  constructor(port) {
    this.port = port;
  }

  /** Roll back an add (or finish an Undo) that a crash interrupted. */
  recover() {
    previous.recover(this.port);
    fs.rmSync(this.port.stagingDir, { recursive: true, force: true });
  }

  _env() {
    return {
      games,
      savedSchemas: this.port.savedSchemas(),
      loadedPaths: this.port.loadedPaths(),
      open: this.port.openFile(),
      schemaDir: this.port.schemaDir,
    };
  }

  /** @returns {Promise<import('../../../src/shared/types/addSchema').AddSchemaPlan>} */
  async inspect(rawRequest) {
    const request = parseRequest(rawRequest);
    return planAdd(await scanAll(request.files), request, this._env());
  }

  /** @returns {Promise<import('../../../src/shared/types/addSchema').AddSchemaResult>} */
  async add(rawCommit) {
    const commit = parseCommit(rawCommit);
    return this.port.exclusive(async () => {
      const { stagingDir } = this.port;
      await fs.promises.rm(stagingDir, { recursive: true, force: true });
      try {
        const scans = await scanAll(commit.files);
        const plan = planAdd(scans, commit, this._env());
        if (!plan.canAdd) return { status: "blocked", plan };
        return await buildAndCommit(plan, scans, commit, this.port);
      } finally {
        await fs.promises.rm(stagingDir, { recursive: true, force: true });
      }
    });
  }

  /** @returns {Promise<import('../../../src/shared/types/addSchema').RestoreResult>} */
  async restorePrevious() {
    return this.port.exclusive(() => {
      const journal = previous.readJournal(this.port);
      const result = previous.restore(this.port);
      if (result.status === "restored") {
        this.port.invalidate([journal.added, ...result.restored]);
      }
      return result;
    });
  }
}

module.exports = { SchemaImporter };
