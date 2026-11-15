// franchise:reload-file, the file-changed removal hooks, the auto-save pause
// and notifications:dismiss's onDismissed. Uses a temp copy of the m22 career.
require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const manager = require("../../main/services/FranchiseFileManager");
const {
  createNotificationStore,
} = require("../../main/services/notificationStore");
const {
  registerNotificationsHandlers,
} = require("../../main/handlers/notificationsHandler");

const CAREER = path.join(__dirname, "..", "data", "m22", "career", "CAREER-M22TEST");
const PLAYER = 4220;
const FIELD = "JerseyNum";

let tmpDir;
let filePath;
let store;
let handlers;
let originalSchemaDir;
const openIds = [];

// Records handle() calls so tests can invoke the registered handlers
const fakeIpc = {
  handle: (channel, fn) => {
    handlers[channel] = fn;
  },
};
const call = (channel, ...args) => handlers[channel]({}, ...args);

test.before(() => {
  originalSchemaDir = manager._schemaDirectory;
});
test.after(() => {
  manager._schemaDirectory = originalSchemaDir;
  manager.setNotificationStore(null);
  manager.setAutoSavePausedCheck(null);
});
test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-extchange-"));
  const schemaDir = path.join(tmpDir, "schemas");
  fs.mkdirSync(schemaDir);
  manager._schemaDirectory = schemaDir;
  filePath = path.join(tmpDir, "CAREER-EXTCHANGE");
  fs.copyFileSync(CAREER, filePath);

  store = createNotificationStore();
  manager.setNotificationStore(store);
  manager.setAutoSavePausedCheck(null);
  handlers = {};
  manager.registerIpcHandlers(fakeIpc);
});
test.afterEach(() => {
  openIds.splice(0).forEach((id) => manager.closeFile(id));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function open(options = { autoSave: false }, at = filePath) {
  const result = await call("franchise:open-file", at, options);
  assert.ok(result.fileId, result.error);
  openIds.push(result.fileId);
  await manager.readTableData(result.fileId, PLAYER, [FIELD]); // writes need read records
  return result.fileId;
}

const write = (fileId, value) =>
  manager.writeBulkTableCells(fileId, [
    { tableId: PLAYER, recordIndex: 0, fieldName: FIELD, value },
  ]);

const read = async (fileId) => {
  const { records } = await manager.readTableData(fileId, PLAYER, [FIELD]);
  return records[0][FIELD];
};

// The queue is drained once a no-op task behind everything has run
const drain = (fileId) => manager._runExclusive(fileId, () => {});

const addFileChanged = (fileId, at = filePath) =>
  store.add({ kind: "file-changed", fileId, data: { path: at } });

const ofKind = (kind, fileId) =>
  store.list().filter((n) => n.kind === kind && n.fileId === fileId);

const bundled22 = () =>
  manager
    .getSavedSchemas()
    .find((s) => s.source === "bundled" && s.gameYear === 22);

test("reload-file keeps the fileId and picks up bytes changed on disk", async (t) => {
  const fileId = await open();
  const before = await read(fileId);
  const value = before === 42 ? 43 : 42;

  // another writer changes the file on disk
  const writer = await open();
  await write(writer, value);
  await manager.saveFile(writer);

  const backup = t.mock.method(manager, "_backupFile", () => {});
  const result = await call("franchise:reload-file", fileId);
  assert.equal(result.fileId, fileId);
  assert.ok(result.metadata);
  assert.equal(backup.mock.callCount(), 0);
  assert.equal(await read(fileId), value);
});

test("reload-file removes the file's file-changed only", async () => {
  const fileId = await open();
  addFileChanged(fileId);
  const other = addFileChanged("other", path.join(tmpDir, "OTHER"));
  const result = await call("franchise:reload-file", fileId);
  assert.ok(result.fileId);
  assert.equal(ofKind("file-changed", fileId).length, 0);
  assert.deepEqual(
    store
      .list()
      .filter((n) => n.kind === "file-changed")
      .map((n) => n.id),
    [other.id],
  );
});

test("reload-file re-checks the schema mismatch", async () => {
  const fileId = await open();
  store.removeWhere((n) => n.kind === "schema-mismatch");
  await call("franchise:reload-file", fileId);
  assert.equal(ofKind("schema-mismatch", fileId).length, 1);
});

test("reload-file keeps a schemaOverride and adds no mismatch", async () => {
  const schemaPath = bundled22().path;
  const fileId = await open({ autoSave: false, schemaOverride: { path: schemaPath } });
  await call("franchise:reload-file", fileId);
  assert.deepEqual(manager.getFile(fileId).settings.schemaOverride, {
    path: schemaPath,
  });
  assert.equal(ofKind("schema-mismatch", fileId).length, 0);
});

test("a failed reload keeps the old file and the notification", async () => {
  const fileId = await open();
  const oldFile = manager.getFile(fileId);
  addFileChanged(fileId);
  fs.writeFileSync(filePath, Buffer.from("not a franchise file"));
  const result = await call("franchise:reload-file", fileId);
  assert.ok(result.error);
  assert.equal(manager.getFile(fileId), oldFile);
  assert.equal(ofKind("file-changed", fileId).length, 1);
});

test("saveFile to its own path removes file-changed", async () => {
  const fileId = await open();
  addFileChanged(fileId);
  await call("franchise:save-file", fileId);
  assert.equal(ofKind("file-changed", fileId).length, 0);
});

test("saveFile to its own path removes file-missing", async () => {
  const fileId = await open();
  store.add({ kind: "file-missing", fileId, data: { path: filePath } });
  fs.rmSync(filePath);
  const result = await call("franchise:save-file", fileId);
  assert.ok(!result?.error, result?.error);
  assert.ok(fs.existsSync(filePath));
  assert.equal(ofKind("file-missing", fileId).length, 0);
});

test("saveFileAs to another path keeps file-missing", async () => {
  const fileId = await open();
  store.add({ kind: "file-missing", fileId, data: { path: filePath } });
  const result = await call(
    "franchise:save-file-as",
    fileId,
    path.join(tmpDir, "COPY"),
  );
  assert.ok(result.path);
  assert.equal(ofKind("file-missing", fileId).length, 1);
});

test("saveFileAs to another path keeps file-changed", async () => {
  const fileId = await open();
  addFileChanged(fileId);
  const result = await call(
    "franchise:save-file-as",
    fileId,
    path.join(tmpDir, "COPY"),
  );
  assert.ok(result.path);
  assert.equal(ofKind("file-changed", fileId).length, 1);
});

test("save-file-as-and-open removes file-changed", async () => {
  const fileId = await open();
  addFileChanged(fileId);
  const result = await call(
    "franchise:save-file-as-and-open",
    fileId,
    path.join(tmpDir, "BRANCH"),
  );
  assert.ok(result.path);
  assert.equal(ofKind("file-changed", fileId).length, 0);
});

test("while paused, an edit doesn't save and stays unsaved", async (t) => {
  const fileId = await open({ autoSave: true });
  manager.setAutoSavePausedCheck((id) => id === fileId);
  const save = t.mock.method(manager.getFile(fileId), "save");
  await write(fileId, 7);
  await drain(fileId);
  assert.equal(save.mock.callCount(), 0);
  assert.equal(await manager.hasUnsavedChanges(fileId), true);
});

test("when not paused, auto-save writes", async () => {
  const fileId = await open({ autoSave: true });
  manager.setAutoSavePausedCheck(() => false);
  await write(fileId, 7);
  await drain(fileId);
  assert.equal(await manager.hasUnsavedChanges(fileId), false);
});

test("notifications:dismiss calls onDismissed with the removed notification", async () => {
  const dismissed = [];
  registerNotificationsHandlers(fakeIpc, store, {
    onDismissed: (n) => dismissed.push(n),
  });
  const n = addFileChanged("some-file");
  await call("notifications:dismiss", n.id);
  assert.equal(store.list().length, 0);
  assert.deepEqual(dismissed, [n]);

  await call("notifications:dismiss", "unknown");
  assert.equal(dismissed.length, 1);
});
