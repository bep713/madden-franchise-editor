// SchemaImporter end to end: a temp userData, the real madden-franchise and
// the FTX fixtures in tests/data/schemas/ftx.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const { spawnSync } = require("child_process");
const { generateSchemaV2, schemaPicker, FranchiseSchema } = require("madden-franchise");

const manager = require("../../main/services/FranchiseFileManager");
const { SchemaImporter } = require("../../main/services/schemaImport");
const { readFtxHeader, includeKey, nameIdentity, scanAll } = require("../../main/services/schemaImport/scan");
const { extraSchemasArg } = require("../../main/services/schemaImport/commit");
const previous = require("../../main/services/schemaImport/previous");
const { checkSchemaMismatch } = require("../../main/handlers/schemaMismatchHandler");
const { registerSchemaImportHandlers } = require("../../main/handlers/schemaImportHandler");
const { fakeLoggedIpc } = require("./helpers/electronStub");
const { makeSchemaGz, readSchemaGz } = require("./helpers/schemaGz");

const FTX = path.join(__dirname, "..", "data", "schemas", "ftx");
const CAREER = path.join(__dirname, "..", "data", "m22", "career", "CAREER-M22TEST");
const REPO = path.join(__dirname, "..", "..");

let tmp;
let schemaDir;
let inDir;
let importer;
let originalSchemaDir;
const openIds = [];

test.before(() => {
  originalSchemaDir = manager._schemaDirectory;
});
test.after(() => {
  manager._schemaDirectory = originalSchemaDir;
});
test.beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-import-"));
  schemaDir = path.join(tmp, "userData", "schemas");
  inDir = path.join(tmp, "in");
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.mkdirSync(inDir);
  manager._schemaDirectory = schemaDir;
  importer = new SchemaImporter(manager.schemaImportPort());
});
test.afterEach(() => {
  openIds.splice(0).forEach((id) => manager.closeFile(id));
  fs.rmSync(tmp, { recursive: true, force: true });
});

/** Copy fixture files into inDir (optionally renamed); returns their paths. */
function input(folder, names, rename = {}) {
  return names.map((name) => {
    const dest = path.join(inDir, rename[name] ?? name);
    fs.copyFileSync(path.join(FTX, folder, name), dest);
    return dest;
  });
}
const GEN = ["MAIN.FTX", "Enums.FTX", "Teams.FTX", "Nested.FTX"];

const request = (files, extra = {}) => ({ files, overrides: {}, includeDefaults: true, ...extra });

/** Inspect, then add exactly what the plan showed. */
async function addAsShown(files, extra = {}) {
  const plan = await importer.inspect(request(files, extra));
  return importer.add({
    ...request(files, extra),
    acceptMissing: plan.missing,
    confirmedTarget: plan.target
      ? { fileName: plan.target.fileName, replaces: plan.target.replaces.map((r) => r.path) }
      : { fileName: "", replaces: [] },
  });
}

async function loadSchema(schemaPath) {
  const schema = new FranchiseSchema(schemaPath);
  await new Promise((resolve, reject) => {
    schema.once("schemas:done", resolve);
    try {
      schema.evaluate();
    } catch (err) {
      reject(err);
    }
  });
  return schema;
}

// Every file under dir, relative, sorted
function tree(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.relative(dir, path.join(d.parentPath ?? d.path, d.name)))
    .sort();
}
const userData = () => tree(path.join(tmp, "userData"));
const port = () => manager.schemaImportPort();

test("content decides the format: gz bytes in .txt, FTX named .gz, a BOM", async () => {
  const gzAsTxt = makeSchemaGz({ gameType: "madden", gameYear: 27, major: 777, minor: 0 }, undefined, {
    dir: inDir,
    fileName: "schema.txt",
  });
  const asTxt = await importer.inspect(request([gzAsTxt]));
  assert.equal(asTxt.kind, "copy-gz");
  assert.equal(asTxt.target.fileName, "M27_777_0.gz");

  const [ftxAsGz] = input("standalone", ["STANDALONE.FTX"], { "STANDALONE.FTX": "standalone.gz" });
  const asGz = await importer.inspect(request([ftxAsGz]));
  assert.equal(asGz.kind, "generate");
  assert.equal(asGz.target.fileName, "M26_310_0.gz");

  const bom = path.join(inDir, "BOM.FTX");
  fs.writeFileSync(bom, "﻿" + fs.readFileSync(path.join(FTX, "standalone", "STANDALONE.FTX"), "utf8"));
  const withBom = await importer.inspect(request([bom]));
  assert.equal(withBom.options.major.value, 310);
  const added = await addAsShown([bom]);
  assert.equal(added.status, "added");

  const text = path.join(inDir, "notes.txt");
  fs.writeFileSync(text, "hello");
  const notes = await importer.inspect(request([text]));
  assert.equal(notes.files[0].role, "invalid");
  assert.equal(notes.problems[0].code, "not-a-schema");
});

test("the header read stops at <schemas>", async () => {
  const big = path.join(inDir, "BIG.FTX");
  const head = fs.readFileSync(path.join(FTX, "gen", "MAIN.FTX"), "utf8").replace("<schemas>", "<schemas>" + "<!-- pad -->".repeat(800000));
  fs.writeFileSync(big, head);
  const stream = fs.createReadStream(big, { highWaterMark: 64 * 1024 });
  let read = 0;
  stream.on("data", (chunk) => (read += chunk.length));
  const header = await readFtxHeader(stream);
  assert.deepEqual(header, {
    databaseName: "Madden27_Franchise",
    major: "900",
    minor: "1",
    includes: ["Enums.FTX", "Teams.FTX"],
  });
  assert.ok(read < fs.statSync(big).size / 10, `read ${read} bytes`);
});

test("the header order matches generateSchemaV2's meta on order/", async () => {
  const files = input("order", ["ORDER_MAIN.FTX", "First.FTX", "Deep.FTX", "Second.FTX"]);
  const plan = await importer.inspect(request(files));
  const fileMap = { main: files[0] };
  files.slice(1).forEach((f) => (fileMap[includeKey(path.basename(f))] = f));
  const root = await generateSchemaV2({ fileMap, extraSchemas: {} });
  assert.deepEqual(root.meta, { major: 250, minor: 3, gameYear: 25 });
  assert.equal(plan.options.game.from, "Deep.FTX");
  assert.deepEqual(
    { gameYear: plan.options.game.value.gameYear, major: plan.options.major.value, minor: plan.options.minor.value },
    { gameYear: root.meta.gameYear, major: root.meta.major, minor: root.meta.minor },
  );
});

test("inspect writes nothing", async () => {
  const before = userData();
  await importer.inspect(request(input("gen", GEN)));
  await importer.inspect(request([path.join(inDir, "missing.FTX")]));
  assert.deepEqual(userData(), before);
});

test("generate: the nested include resolves through the case fallback, and the picker loads it", async () => {
  const files = input("gen", [...GEN, "Unrelated.FTX"]);
  const plan = await importer.inspect(request([inDir]));
  assert.deepEqual(plan.files.map((f) => f.path), [...files].sort((a, b) => path.basename(a).localeCompare(path.basename(b))));
  assert.equal(plan.files.find((f) => f.name === "Unrelated.FTX").role, "unused");

  const result = await addAsShown([inDir]);
  assert.equal(result.status, "added");
  assert.deepEqual(result.added, {
    identity: { gameType: "madden", gameYear: 27, major: 900, minor: 1 },
    fileName: "M27_900_1.gz",
    path: path.join(schemaDir, "M27_900_1.gz"),
    replaced: false,
    loadedBy: [],
    warnings: [],
  });
  assert.deepEqual(tree(schemaDir), ["M27_900_1.gz"]);

  const saved = readSchemaGz(result.added.path);
  assert.deepEqual(saved.meta, { major: 900, minor: 1, gameYear: 27, gameType: "madden", databaseName: "Madden27_Franchise" });
  const picked = schemaPicker.pick(27, 900, 1, { schemaDirectory: schemaDir }, "madden");
  assert.equal(picked.path, result.added.path);
  const schema = await loadSchema(picked.path);
  for (const name of ["League", "Team", "Coach"]) assert.ok(schema.schemaMap[name], name);
  assert.ok(!schema.schemaMap.Stray, "unused files are not generated");
  const teamType = schema.schemaMap.Team.attributes.find((a) => a.name === "TeamType");
  assert.deepEqual(teamType.enum.members.map((m) => m.name), ["Pro", "AllStar"]);
  assert.deepEqual(userData(), ["schemas/M27_900_1.gz".split("/").join(path.sep)], "no staging left");
});

test("generate: includes named with a folder (the CFB 27 layout) are all generated", async () => {
  const write = (rel, xml) => {
    fs.mkdirSync(path.dirname(path.join(inDir, rel)), { recursive: true });
    fs.writeFileSync(path.join(inDir, rel), xml);
  };
  write("Franchise-Schemas.FTX", `<FranTkData databaseName="CollegeFB27_Franchise" dataMajorVersion="904" dataMinorVersion="0">
    <Includes><IncludeFile fileName="Core-Schemas.ftx"/><IncludeFile fileName="Franchise-Schemas\\Team.ftx"/></Includes></FranTkData>`);
  write("Core-Schemas.FTX", `<FranTkData databaseName="CollegeFB27_Franchise" dataMajorVersion="904" dataMinorVersion="0">
    <Includes><IncludeFile fileName="Core-Schemas\\TeamType.ftx"/></Includes></FranTkData>`);
  write("core-schemas/teamtype.FTX", `<FranTkData><schemas><enum name="TeamType" assetId="9100" isRecordPersistent="false">
    <attribute name="Pro" idx="0" value="0"/></enum></schemas></FranTkData>`);
  write("franchise-schemas/team.FTX", `<FranTkData><schemas><schema name="Team" assetId="9002" ownerAssetId="0" numMembers="1" base="Record">
    <attribute idx="0" name="TeamType" type="TeamType"/></schema></schemas></FranTkData>`);

  const files = [inDir, path.join(inDir, "core-schemas"), path.join(inDir, "franchise-schemas")];
  const result = await addAsShown(files, { includeDefaults: false });
  assert.equal(result.status, "added");
  assert.deepEqual(readSchemaGz(result.added.path).schemas.map((s) => s.name), ["Team"]);
  const schema = await loadSchema(result.added.path);
  assert.deepEqual(schema.schemaMap.Team.attributes[0].enum.members.map((m) => m.name), ["Pro"]);
});

test("a chosen entry is generated, with its own databaseName", async () => {
  const files = [...input("gen", GEN), ...input("standalone", ["STANDALONE.FTX"])];
  const entry = path.join(inDir, "STANDALONE.FTX");
  const result = await addAsShown(files, { entry });
  assert.equal(result.status, "added");
  assert.equal(result.added.fileName, "M26_310_0.gz");
  const saved = readSchemaGz(result.added.path);
  assert.equal(saved.meta.databaseName, "Madden26_Franchise");
  const schema = await loadSchema(result.added.path);
  assert.ok(schema.schemaMap.Player);
  assert.ok(!schema.schemaMap.Team, "the detected tree is not generated");

  await assert.rejects(importer.inspect(request(files, { entry: "STANDALONE.FTX" })), /entry/);
  await assert.rejects(importer.inspect(request(files, { entry: 3 })), /entry/);
});

test("Add default schemas: on keeps the extras in the file, off leaves them to the load", async () => {
  assert.deepEqual(extraSchemasArg(false), {});
  assert.equal(extraSchemasArg(true), undefined);

  const [standalone] = input("standalone", ["STANDALONE.FTX"]);
  const on = await addAsShown([standalone]);
  assert.ok(readSchemaGz(on.added.path).schemas.some((s) => s.name === "UserEntity"));

  fs.rmSync(on.added.path);
  const off = await addAsShown([standalone], { includeDefaults: false });
  assert.equal(off.status, "added");
  const raw = readSchemaGz(off.added.path);
  assert.ok(!raw.schemas.some((s) => s.name === "UserEntity"), "extras left out of the file");
  assert.ok(raw.schemas.some((s) => s.name === "Player"));
  const loaded = await loadSchema(off.added.path);
  assert.ok(loaded.schemaMap.UserEntity, "evaluateSchemaGzip merges the defaults at load");
});

test("malformed XML and an empty enum are blocked with nothing written", async () => {
  const broken = await addAsShown([...input("bad", ["BROKEN_MAIN.FTX"]), ...input("gen", ["Enums.FTX"])]);
  assert.equal(broken.status, "blocked");
  const malformed = broken.plan.problems.find((p) => p.code === "malformed-xml");
  assert.equal(malformed.path, path.join(inDir, "BROKEN_MAIN.FTX"));
  assert.match(malformed.detail, /^Line 13: /);
  assert.equal(broken.plan.canAdd, false);
  assert.deepEqual(userData(), []);

  fs.rmSync(inDir, { recursive: true });
  fs.mkdirSync(inDir);
  const empty = await addAsShown(input("bad", ["EMPTY_ENUM_MAIN.FTX", "EmptyEnum.FTX"]));
  assert.equal(empty.status, "blocked");
  assert.deepEqual(
    empty.plan.problems.find((p) => p.code === "empty-enum"),
    { code: "empty-enum", severity: "blocking", detail: "Nothing" },
  );
  assert.deepEqual(userData(), []);
});

test("no-tables: an FTX tree with no tables and no defaults", async () => {
  const bare = path.join(inDir, "BARE.FTX");
  fs.writeFileSync(bare, '<FranTkData databaseName="Madden27_Franchise" dataMajorVersion="903" dataMinorVersion="0"><schemas/></FranTkData>');
  const result = await addAsShown([bare], { includeDefaults: false });
  assert.equal(result.status, "blocked");
  assert.ok(result.plan.problems.some((p) => p.code === "no-tables"));
  assert.deepEqual(userData(), []);
});

test("copy-gz: byte-identical when the meta matches, rewritten otherwise", async () => {
  const exact = makeSchemaGz({ gameType: "madden", gameYear: 27, major: 777, minor: 0, extra: "kept" }, undefined, { dir: inDir, fileName: "exact.gz" });
  const same = await addAsShown([exact]);
  assert.deepEqual(fs.readFileSync(same.added.path), fs.readFileSync(exact));

  const partial = makeSchemaGz({ gameYear: 27, major: 777, minor: 1, extra: "kept" }, undefined, { dir: inDir, fileName: "partial.gz" });
  const plan = await importer.inspect(request([partial], { overrides: { game: { gameType: "college", year: "27" } } }));
  assert.deepEqual(plan.problems.find((p) => p.code === "meta-written").changes, [
    { field: "gameType", from: null, to: "college" },
  ]);
  const rewritten = await addAsShown([partial], { overrides: { game: { gameType: "college", year: "27" } } });
  assert.equal(rewritten.added.fileName, "C27_777_1.gz");
  assert.deepEqual(readSchemaGz(rewritten.added.path).meta, {
    gameYear: 27,
    major: 777,
    minor: 1,
    extra: "kept",
    gameType: "college",
  });
});

test("a meta-less gz saved for the M22 fixture opens it with no mismatch", async () => {
  const bundled = manager.getSavedSchemas().find((s) => s.source === "bundled" && s.gameYear === 22);
  const json = JSON.parse(zlib.gunzipSync(fs.readFileSync(bundled.path)).toString());
  delete json.meta;
  const metaless = path.join(inDir, "m22.gz");
  fs.writeFileSync(metaless, zlib.gzipSync(JSON.stringify(json)));

  const careerPath = path.join(tmp, "CAREER-IMPORT");
  fs.copyFileSync(CAREER, careerPath);
  const { fileId } = await manager.openFile(careerPath, { autoSave: false });
  openIds.push(fileId);
  const expected = manager.getFile(fileId).expectedSchemaVersion;

  const plan = await importer.inspect(request([metaless]));
  assert.equal(plan.options.game.source, "open-file");
  assert.equal(plan.options.major.value, expected.major);
  assert.ok(plan.problems.some((p) => p.code === "version-guessed"));
  const result = await addAsShown([metaless]);
  assert.deepEqual(result.added.warnings, [
    { code: "version-guessed", severity: "warning", files: ["CAREER-IMPORT"] },
  ]);

  manager.closeFile(openIds.pop());
  const { fileId: again } = await manager.openFile(careerPath, { autoSave: false });
  openIds.push(again);
  const file = manager.getFile(again);
  assert.equal(file.schemaList.path, result.added.path);
  assert.equal(checkSchemaMismatch(file).hasMismatch, false);
});

test("a re-add replaces the custom copy, the picker loads the new one, Undo brings the first back", async () => {
  const first = await addAsShown(input("gen", GEN));
  const firstBytes = fs.readFileSync(first.added.path);

  const main = path.join(inDir, "MAIN.FTX");
  fs.writeFileSync(main, fs.readFileSync(main, "utf8").replace('name="League"', 'name="League2"'));
  const plan = await importer.inspect(request(input("gen", GEN.slice(1)).concat(main)));
  assert.deepEqual(plan.target.replaces, [{ path: first.added.path, loadedBy: [] }]);
  assert.ok(plan.problems.some((p) => p.code === "replaces-custom"));

  const second = await addAsShown(plan.files.map((f) => f.path));
  assert.equal(second.added.replaced, true);
  assert.deepEqual(tree(schemaDir), ["M27_900_1.gz"]);
  const picked = schemaPicker.pick(27, 900, 1, { schemaDirectory: schemaDir }, "madden");
  assert.ok((await loadSchema(picked.path)).schemaMap.League2);
  assert.equal(previous.readJournal(port()).state, "done");

  assert.deepEqual(await importer.restorePrevious(), { status: "restored", restored: [first.added.path] });
  assert.deepEqual(fs.readFileSync(first.added.path), firstBytes);
  assert.ok(!fs.existsSync(port().previousDir));
  assert.deepEqual(await importer.restorePrevious(), { status: "gone" });
});

test("replacing a v4 .FTX in a subfolder; Undo puts it back there", async () => {
  const sub = path.join(schemaDir, "mine");
  fs.mkdirSync(sub);
  const v4 = path.join(sub, "M27_900_1.FTX");
  fs.copyFileSync(path.join(FTX, "gen", "MAIN.FTX"), v4);

  const result = await addAsShown(input("gen", GEN));
  assert.equal(result.added.replaced, true);
  assert.ok(!fs.existsSync(v4));
  assert.deepEqual(tree(schemaDir), ["M27_900_1.gz"]);

  assert.equal((await importer.restorePrevious()).status, "restored");
  assert.ok(fs.existsSync(v4));
  assert.deepEqual(tree(schemaDir), [path.join("mine", "M27_900_1.FTX")]);
});

test("Undo is refused once the added file changed", async () => {
  await addAsShown(input("gen", GEN));
  const second = await addAsShown(input("gen", GEN));
  fs.appendFileSync(second.added.path, "x");
  assert.deepEqual(await importer.restorePrevious(), { status: "gone" });
});

test("a bundled twin is shadowed by the added custom file", async () => {
  const twin = makeSchemaGz({ gameType: "madden", gameYear: 27, major: 620, minor: 0 }, undefined, { dir: inDir });
  const plan = await importer.inspect(request([twin]));
  assert.deepEqual(plan.target.replaces, []);
  const result = await addAsShown([twin]);
  assert.equal(schemaPicker.pick(27, 620, 0, { schemaDirectory: schemaDir }, "madden").path, result.added.path);
});

test("the schema-fields cache drops every path an add touches", async () => {
  const first = await addAsShown(input("gen", GEN));
  await manager.getSchemaFields({ path: first.added.path });
  const key = path.resolve(first.added.path).toLowerCase();
  assert.ok(manager._schemaFieldsCache.has(key));
  await addAsShown(input("gen", GEN));
  assert.ok(!manager._schemaFieldsCache.has(key));
});

test("two concurrent adds: the second sees target-changed", async () => {
  const files = input("gen", GEN);
  const plan = await importer.inspect(request(files));
  const commit = {
    ...request(files),
    acceptMissing: [],
    confirmedTarget: { fileName: plan.target.fileName, replaces: [] },
  };
  const [a, b] = await Promise.all([importer.add(commit), importer.add(commit)]);
  assert.equal(a.status, "added");
  assert.equal(b.status, "blocked");
  assert.ok(b.plan.problems.some((p) => p.code === "target-changed"));
  assert.deepEqual(tree(schemaDir), ["M27_900_1.gz"]);
});

test("a missing include is accepted at add and reported on the result", async () => {
  const files = input("gen", ["MAIN.FTX", "Enums.FTX", "Teams.FTX"]);
  const result = await addAsShown(files);
  assert.equal(result.status, "added");
  assert.deepEqual(result.added.warnings, [
    { code: "missing-includes-accepted", severity: "warning", files: ["NESTED.FTX"] },
  ]);
  assert.ok(!(await loadSchema(result.added.path)).schemaMap.Coach);
});

// Throws on the nth fs.renameSync call made by fn
async function crashOnRename(n, fn) {
  const real = fs.renameSync;
  let calls = 0;
  fs.renameSync = (...args) => {
    calls++;
    if (calls === n) throw new Error(`crash at rename ${n}`);
    return real(...args);
  };
  try {
    await fn();
  } finally {
    fs.renameSync = real;
  }
}

test("the journal: a crash at each step before 'done' rolls back on recover(), run twice", async () => {
  // replace() renames: 1 journal 'moving', 2 move out, 3 staged onto target, 4 journal 'done'
  for (const n of [1, 2, 3, 4]) {
    fs.rmSync(schemaDir, { recursive: true, force: true });
    fs.rmSync(port().previousDir, { recursive: true, force: true });
    fs.mkdirSync(schemaDir, { recursive: true });
    const old = makeSchemaGz({ gameType: "madden", gameYear: 27, major: 900, minor: 1 }, undefined, { dir: schemaDir, fileName: "M27_900_1.gz" });
    const oldBytes = fs.readFileSync(old);
    const files = input("gen", GEN);
    const plan = await importer.inspect(request(files));

    // Keep the staged file, as a real crash would
    const realRm = fs.promises.rm;
    fs.promises.rm = async () => {};
    try {
      await crashOnRename(n, () =>
        assert.rejects(
          importer.add({
            ...request(files),
            acceptMissing: [],
            confirmedTarget: { fileName: plan.target.fileName, replaces: [old] },
          }),
          /crash at rename/,
        ),
      );
    } finally {
      fs.promises.rm = realRm;
    }

    const recovered = new SchemaImporter(manager.schemaImportPort());
    recovered.recover();
    recovered.recover();
    assert.deepEqual(tree(schemaDir), ["M27_900_1.gz"], `crash ${n}`);
    assert.deepEqual(fs.readFileSync(old), oldBytes, `crash ${n}: the old copy is back`);
    assert.ok(!fs.existsSync(port().stagingDir), `crash ${n}: staging cleared`);
    assert.ok(!fs.existsSync(port().previousDir), `crash ${n}: previous cleared`);
  }
});

test("a crash during Undo is finished by recover()", async () => {
  const first = await addAsShown(input("gen", GEN));
  const firstBytes = fs.readFileSync(first.added.path);
  await addAsShown(input("gen", GEN));
  // restore(): rename 1 is the 'restoring' journal, 2 moves the first copy back
  await crashOnRename(2, () => assert.rejects(importer.restorePrevious(), /crash at rename/));
  new SchemaImporter(manager.schemaImportPort()).recover();
  assert.deepEqual(fs.readFileSync(first.added.path), firstBytes);
  assert.ok(!fs.existsSync(port().previousDir));
});

test("library pins (4.4.1)", async (t) => {
  await t.test("a missing include resolves silently", async () => {
    const [main] = input("gen", ["MAIN.FTX"]);
    const root = await generateSchemaV2({ fileMap: { main }, extraSchemas: {} });
    assert.deepEqual(root.schemas.map((s) => s.name), ["League"]);
  });

  await t.test("an include cycle recurses without end", () => {
    const dir = path.join(FTX, "cycle");
    const script = `require("madden-franchise").generateSchemaV2({ fileMap: {
      main: ${JSON.stringify(path.join(dir, "CYCLE_MAIN.FTX"))},
      rosters: ${JSON.stringify(path.join(dir, "Rosters.FTX"))},
      players: ${JSON.stringify(path.join(dir, "Players.FTX"))} }, extraSchemas: {} })
      .then(() => process.exit(0), () => process.exit(2));`;
    const run = spawnSync(process.execPath, ["-e", script], { cwd: REPO, timeout: 3000 });
    assert.equal(run.status, null, "still running when killed");
  });

  await t.test("custom is picked over bundled, and subfolders before the folder itself", () => {
    const root = makeSchemaGz(null, undefined, { dir: schemaDir, fileName: "M27_620_0.gz" });
    assert.equal(schemaPicker.pick(27, 620, 0, { schemaDirectory: schemaDir }, "madden").path, root);
    const nested = makeSchemaGz(null, undefined, { dir: path.join(schemaDir, "sub"), fileName: "M27_620_0.gz" });
    assert.equal(schemaPicker.pick(27, 620, 0, { schemaDirectory: schemaDir }, "madden").path, nested);
  });

  await t.test("nameIdentity matches the picker's file-name rule", () => {
    const names = ["M27_620_0.gz", "C27_468_2.gz", "m22_329_1.FTX", "620_0.gz", "foo_M25_1_2.gz", "notes.txt", "Mx_1_2.gz"];
    names.forEach((n) => fs.writeFileSync(path.join(inDir, n), ""));
    const picked = schemaPicker.retrieveSchemas(inDir).filter((s) => path.dirname(s.path) === inDir);
    for (const n of names) {
      const fromPicker = picked.find((s) => path.basename(s.path) === n);
      const mine = nameIdentity(n);
      if (!fromPicker) assert.ok(mine.major === null || mine.minor === null, n);
      else assert.deepEqual(mine, { gameType: fromPicker.gameType, gameYear: fromPicker.gameYear, major: fromPicker.major, minor: fromPicker.minor }, n);
    }
  });

  await t.test("an include is looked up by its name as written, folder included", async () => {
    const main = path.join(inDir, "MAIN.FTX");
    const team = path.join(inDir, "Team.FTX");
    fs.writeFileSync(main, '<FranTkData databaseName="Madden27_Franchise"><Includes><IncludeFile fileName="Sub\\Team.ftx"/></Includes></FranTkData>');
    fs.writeFileSync(team, '<FranTkData><schemas><schema name="Team" assetId="1" ownerAssetId="0" numMembers="1" base="Record"><attribute idx="0" name="X" type="bool"/></schema></schemas></FranTkData>');
    const byBasename = await generateSchemaV2({ fileMap: { main, team }, extraSchemas: {} });
    assert.deepEqual(byBasename.schemas, [], "a basename key is skipped silently");
    const asWritten = await generateSchemaV2({ fileMap: { main, "sub\\team": team }, extraSchemas: {} });
    assert.deepEqual(asWritten.schemas.map((s) => s.name), ["Team"]);
  });
});

test("folders expand one level; duplicates are dropped ignoring case", async () => {
  input("gen", GEN);
  fs.mkdirSync(path.join(inDir, "deeper"));
  fs.writeFileSync(path.join(inDir, "readme.md"), "");
  const scans = await scanAll([inDir, path.join(inDir, "main.ftx")]);
  assert.deepEqual(scans.map((s) => s.name), ["Enums.FTX", "MAIN.FTX", "Nested.FTX", "Teams.FTX"]);
});

test("the handler returns { error } for a malformed request", async () => {
  const ipc = fakeLoggedIpc();
  registerSchemaImportHandlers(ipc, importer);
  assert.match((await ipc.invoke("schema:inspect-add", { files: "nope" })).error, /Invalid/);
  assert.match((await ipc.invoke("schema:add", request([]))).error, /Invalid/);
  assert.equal((await ipc.invoke("schema:inspect-add", request([]))).problems[0].code, "no-files");
  assert.deepEqual(await ipc.invoke("schema:restore-previous"), { status: "gone" });
});

test("nothing outside main/services/schemaImport requires its internals", () => {
  const sources = [path.join(REPO, "main.js")];
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) {
        if (p !== path.join(REPO, "main", "services", "schemaImport")) walk(p);
      } else if (p.endsWith(".js")) sources.push(p);
    });
  walk(path.join(REPO, "main"));
  const offenders = sources.filter((f) =>
    /require\([^)]*schemaImport\/(scan|plan|commit|previous)/.test(fs.readFileSync(f, "utf8")),
  );
  assert.deepEqual(offenders, []);
});
