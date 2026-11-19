// Schema list/delete and unsaved-change tracking in FranchiseFileManager.
// Uses a temp custom schema dir and a temp copy of the m22 career fixture.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const manager = require("../../main/services/FranchiseFileManager");

const CAREER = path.join(__dirname, "..", "data", "m22", "career", "CAREER-M22TEST");
const PLAYER = 4220;
const FIELD = "JerseyNum";

let tmpDir;
let schemaDir;
let filePath;
let originalSchemaDir;
const openIds = [];

test.before(() => {
  originalSchemaDir = manager._schemaDirectory;
});
test.after(() => {
  manager._schemaDirectory = originalSchemaDir;
});
test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-schemas-"));
  schemaDir = path.join(tmpDir, "schemas");
  fs.mkdirSync(schemaDir);
  manager._schemaDirectory = schemaDir;
  filePath = path.join(tmpDir, "CAREER-SCHEMAS");
  fs.copyFileSync(CAREER, filePath);
});
test.afterEach(() => {
  openIds.splice(0).forEach((id) => manager.closeFile(id));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function open(options = { autoSave: false }, at = filePath) {
  const { fileId } = await manager.openFile(at, options);
  openIds.push(fileId);
  await manager.readTableData(fileId, PLAYER, [FIELD]); // writes need read records
  return fileId;
}

const write = (fileId, value) =>
  manager.writeBulkTableCells(fileId, [
    { tableId: PLAYER, recordIndex: 0, fieldName: FIELD, value },
  ]);

// A copy of the fixture's bundled schema, placed in the custom dir
function addCustomSchema(name = "M22_999_1.gz") {
  const bundled = manager
    .getSavedSchemas()
    .find((s) => s.source === "bundled" && s.gameYear === 22);
  const dest = path.join(schemaDir, name);
  fs.copyFileSync(bundled.path, dest);
  return dest;
}

test("getSavedSchemas tags bundled and custom schemas", () => {
  const custom = addCustomSchema();
  fs.mkdirSync(path.join(schemaDir, "sub"));
  const nested = path.join(schemaDir, "sub", "C27_1_2.gz");
  fs.copyFileSync(custom, nested);

  const schemas = manager.getSavedSchemas();
  const customEntries = schemas.filter((s) => s.source === "custom");
  assert.deepEqual(
    customEntries.map((s) => path.resolve(s.path)).sort(),
    [custom, nested].sort(),
  );
  const nestedEntry = customEntries.find((s) => s.gameType === "college");
  assert.equal(nestedEntry.gameYear, 27);

  const bundled = schemas.filter((s) => s.source === "bundled");
  assert.ok(bundled.length > 0);
  assert.ok(bundled.every((s) => !path.resolve(s.path).startsWith(schemaDir)));
  assert.ok(bundled.some((s) => s.gameType === "madden" && s.gameYear === 22));
});

test("getSavedSchemas creates a missing custom dir", () => {
  fs.rmSync(schemaDir, { recursive: true });
  const schemas = manager.getSavedSchemas();
  assert.ok(fs.existsSync(schemaDir));
  assert.ok(schemas.every((s) => s.source === "bundled"));
});

test("deleteSchema refuses anything that isn't an unloaded custom schema file", async () => {
  const outside = path.join(tmpDir, "M22_1_1.gz");
  fs.writeFileSync(outside, "x");
  fs.mkdirSync(path.join(schemaDir, "sub"));
  const bundled = manager.getSavedSchemas().find((s) => s.source === "bundled");

  for (const target of [
    outside,
    "D:\\x.gz",
    schemaDir,
    path.join(schemaDir, "..", "M22_1_1.gz"),
    path.join(schemaDir, "sub"),
    bundled.path,
  ]) {
    await assert.rejects(manager.deleteSchema(target), Error, target);
  }
  assert.ok(fs.existsSync(outside));

  // the schema an open file has loaded
  const loaded = addCustomSchema();
  const { fileId } = await manager.openFile(filePath, {
    autoSave: false,
    schemaOverride: { path: loaded },
  });
  openIds.push(fileId);
  assert.equal(path.resolve(manager.getFile(fileId).schemaList.path), loaded);
  await assert.rejects(manager.deleteSchema(loaded.toUpperCase()), /loaded/);
  assert.ok(fs.existsSync(loaded));
});

test("deleteSchema deletes a custom schema, matching case-insensitively", async () => {
  const custom = addCustomSchema();
  const other = addCustomSchema("M22_999_2.gz");
  await manager.deleteSchema(custom);
  assert.ok(!fs.existsSync(custom));

  if (process.platform === "win32") {
    await manager.deleteSchema(other.toUpperCase());
    assert.ok(!fs.existsSync(other));
  }
});

test("hasUnsavedChanges tracks writes and saves to the file's own path", async () => {
  const fileId = await open();
  assert.equal(await manager.hasUnsavedChanges(fileId), false);

  await write(fileId, 11);
  assert.equal(await manager.hasUnsavedChanges(fileId), true);

  await manager.saveFile(fileId);
  assert.equal(await manager.hasUnsavedChanges(fileId), false);

  // a suppressed (bulk) write still counts
  manager.activeFiles.get(fileId).suppressChangeEvents = true;
  await write(fileId, 12);
  manager.activeFiles.get(fileId).suppressChangeEvents = false;
  assert.equal(await manager.hasUnsavedChanges(fileId), true);

  // a copy elsewhere leaves the original dirty
  await manager.saveFileAs(fileId, path.join(tmpDir, "COPY"));
  assert.equal(await manager.hasUnsavedChanges(fileId), true);

  await manager.saveFileAsAndOpen(fileId, path.join(tmpDir, "MOVED"));
  assert.equal(await manager.hasUnsavedChanges(fileId), false);
});

test("hasUnsavedChanges is false once a queued auto-save completes", async () => {
  const fileId = await open({ autoSave: true });
  await write(fileId, 13);
  assert.equal(await manager.hasUnsavedChanges(fileId), false);
});

test("hasUnsavedChanges stays true when the save fails", async () => {
  const fileId = await open();
  await write(fileId, 14);
  const file = manager.getFile(fileId);
  file.save = async () => {
    throw new Error("disk full");
  };
  await assert.rejects(manager.saveFile(fileId), /disk full/);
  assert.equal(await manager.hasUnsavedChanges(fileId), true);
});
