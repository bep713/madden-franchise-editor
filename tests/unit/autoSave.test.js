// Per-file write lock and coalesced auto-save in FranchiseFileManager. Works
// on a temp copy of the m22 career fixture.
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
let filePath;
const openIds = [];

test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-autosave-"));
  filePath = path.join(tmpDir, "CAREER-AUTOSAVE");
  fs.copyFileSync(CAREER, filePath);
});
test.afterEach(() => {
  openIds.splice(0).forEach((id) => manager.closeFile(id));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function open(options) {
  const { fileId } = await manager.openFile(filePath, options);
  openIds.push(fileId);
  await manager.readTableData(fileId, PLAYER, [FIELD]); // writes need read records
  const file = manager.getFile(fileId);
  const saves = { count: 0 };
  file.on("saving", () => saves.count++);
  return { fileId, saves };
}

const write = (fileId, value) =>
  manager.writeBulkTableCells(fileId, [
    { tableId: PLAYER, recordIndex: 0, fieldName: FIELD, value },
  ]);

// The queue is drained once a no-op task behind everything has run
const drain = (fileId) => manager._runExclusive(fileId, () => {});

async function readFromDisk() {
  const { fileId } = await manager.openFile(filePath, { autoSave: false });
  openIds.push(fileId);
  const { records } = await manager.readTableData(fileId, PLAYER, [FIELD]);
  return records[0][FIELD];
}

test("a fast double undo answers in order and leaves the last value on disk", async () => {
  const { fileId } = await open({ autoSave: true });
  for (const value of [5, 6, 7]) {
    await write(fileId, value);
  }

  // fired without waiting, like two quick Ctrl+Z presses
  const order = [];
  const first = write(fileId, 6).then((r) => (order.push(6), r));
  const second = write(fileId, 5).then((r) => (order.push(5), r));
  const [, last] = await Promise.all([first, second]);
  assert.deepEqual(order, [6, 5]);
  assert.equal(last.records[0].record[FIELD], 5);

  await drain(fileId);
  assert.equal(await readFromDisk(), 5);
});

test("writes fired together share auto-saves", async () => {
  const { fileId, saves } = await open({ autoSave: true });
  await Promise.all([1, 2, 3, 4, 5].map((value) => write(fileId, value)));
  await drain(fileId);
  assert.ok(saves.count >= 1 && saves.count <= 2, `saved ${saves.count} times`);
  assert.equal(await readFromDisk(), 5);
});

test("nothing is saved with autoSave off", async () => {
  const before = fs.readFileSync(filePath);
  const { mtimeMs } = fs.statSync(filePath);
  const { fileId, saves } = await open({ autoSave: false });
  await write(fileId, 9);
  await drain(fileId);
  assert.equal(saves.count, 0);
  assert.equal(fs.statSync(filePath).mtimeMs, mtimeMs);
  assert.ok(fs.readFileSync(filePath).equals(before));
});

test("a failed task doesn't block the next one", async () => {
  const { fileId } = await open({ autoSave: true });
  const failed = manager.writeBulkTableCells(fileId, null);
  const next = write(fileId, 8);
  await assert.rejects(failed);
  const result = await next;
  assert.equal(result.records[0].record[FIELD], 8);
  await drain(fileId);
  assert.equal(await readFromDisk(), 8);
});
