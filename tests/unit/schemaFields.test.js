// getSchemaFields in FranchiseFileManager: path allowlist, field rows, LRU cache.
// Uses a temp custom schema dir so deleting a custom copy is safe.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const manager = require("../../main/services/FranchiseFileManager");

let tmpDir;
let schemaDir;
let originalSchemaDir;

test.before(() => {
  originalSchemaDir = manager._schemaDirectory;
});
test.after(() => {
  manager._schemaDirectory = originalSchemaDir;
});
test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-schema-fields-"));
  schemaDir = path.join(tmpDir, "schemas");
  fs.mkdirSync(schemaDir);
  manager._schemaDirectory = schemaDir;
  manager._schemaFieldsCache.clear();
});
test.afterEach(() => {
  manager._schemaFieldsCache.clear();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const bundled = (year) =>
  manager
    .getSavedSchemas()
    .find((s) => s.source === "bundled" && s.gameYear === year);

const key = (p) => path.resolve(p).toLowerCase();

test("path source returns meta and sorted fields", async () => {
  const { path: p } = bundled(22);
  const { meta, fields } = await manager.getSchemaFields({ path: p });

  assert.equal(meta.gameYear, 22);
  assert.ok(fields.length > 0);
  assert.ok(
    fields.some(
      (f) => f.name === "JerseyNum" && f.table === "Player" && f.type === "int",
    ),
  );
  assert.ok(fields.every((f) => typeof f.type === "string"));

  const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" });
  for (let i = 1; i < fields.length; i++) {
    assert.ok(cmp(fields[i - 1].table, fields[i].table) <= 0);
  }
});

test("a path outside the known schemas is rejected", async () => {
  const outside = path.join(tmpDir, "M22_1_1.gz");
  fs.copyFileSync(bundled(22).path, outside);
  await assert.rejects(
    manager.getSchemaFields({ path: outside }),
    /Not a known schema/,
  );
});

test("the same path in different case and slashes is accepted", async () => {
  const { path: p } = bundled(22);
  const variant = p.replace(/\\/g, "/").toUpperCase();
  const a = await manager.getSchemaFields({ path: p });
  const b = await manager.getSchemaFields({ path: variant });
  assert.equal(b.fields, a.fields);
});

test("a repeat call returns the cached fields", async () => {
  const { path: p } = bundled(22);
  const a = await manager.getSchemaFields({ path: p });
  const b = await manager.getSchemaFields({ path: p });
  assert.equal(a.fields, b.fields);
});

test("cache keeps the 3 most recent schemas", async () => {
  const paths = [19, 20, 21, 22].map((y) => bundled(y).path);
  const first = await manager.getSchemaFields({ path: paths[0] });
  for (const p of paths.slice(1)) await manager.getSchemaFields({ path: p });

  assert.equal(manager._schemaFieldsCache.size, 3);
  assert.equal(manager._schemaFieldsCache.has(key(paths[0])), false);
  const again = await manager.getSchemaFields({ path: paths[0] });
  assert.notEqual(again.fields, first.fields);
});

test("deleteSchema drops the schema from the cache", async () => {
  const dest = path.join(schemaDir, "M22_999_1.gz");
  fs.copyFileSync(bundled(22).path, dest);
  await manager.getSchemaFields({ path: dest });
  assert.ok(manager._schemaFieldsCache.has(key(dest)));

  await manager.deleteSchema(dest);
  assert.equal(manager._schemaFieldsCache.has(key(dest)), false);
});

test("invalid sources are rejected", async () => {
  await assert.rejects(
    manager.getSchemaFields({ fileId: "nope" }),
    /File not found/,
  );
  await assert.rejects(manager.getSchemaFields({}), /Invalid schema source/);
  await assert.rejects(
    manager.getSchemaFields({ path: "a", fileId: "b" }),
    /Invalid schema source/,
  );
  await assert.rejects(manager.getSchemaFields(null), /Invalid schema source/);
});
