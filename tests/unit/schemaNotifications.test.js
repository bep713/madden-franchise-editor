// Schema-mismatch notifications created by the franchise:* IPC handlers, and
// the schema-not-found open error. Uses a temp copy of the m22 career fixture.
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

const DATA = path.join(__dirname, "..", "data", "m22");
const CAREER = path.join(DATA, "career", "CAREER-M22TEST");
const FTC = path.join(DATA, "common", "FTC-E2ETEST");

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
});
test.beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-notify-"));
  const schemaDir = path.join(tmpDir, "schemas");
  fs.mkdirSync(schemaDir);
  manager._schemaDirectory = schemaDir;
  filePath = path.join(tmpDir, "CAREER-NOTIFY");
  fs.copyFileSync(CAREER, filePath);

  store = createNotificationStore();
  manager.setNotificationStore(store);
  handlers = {};
  manager.registerIpcHandlers(fakeIpc);
});
test.afterEach(() => {
  openIds.splice(0).forEach((id) => manager.closeFile(id));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function open(options, at = filePath) {
  const result = await call("franchise:open-file", at, options);
  if (result.fileId) openIds.push(result.fileId);
  return result;
}

const mismatches = (fileId) =>
  store
    .list()
    .filter((n) => n.kind === "schema-mismatch" && n.fileId === fileId);

const bundled22 = () =>
  manager
    .getSavedSchemas()
    .find((s) => s.source === "bundled" && s.gameYear === 22);

test("open adds one schema-mismatch notification", async () => {
  const { fileId } = await open({ autoSave: false });
  const list = mismatches(fileId);
  assert.equal(list.length, 1);
  const { expected, loaded, gameType } = list[0].data;
  assert.equal(expected.major, 328);
  assert.equal(expected.minor, 1);
  assert.equal(loaded.major, 329);
  assert.equal(loaded.minor, 1);
  assert.equal(gameType, "madden");
});

test("open with schemaOverride adds none", async () => {
  const { fileId } = await open({
    autoSave: false,
    schemaOverride: { path: bundled22().path },
  });
  assert.ok(fileId);
  assert.equal(store.list().length, 0);
});

test("load-schema removes the file's notification", async () => {
  const { fileId } = await open({ autoSave: false });
  assert.equal(mismatches(fileId).length, 1);
  const result = await call(
    "franchise:load-schema",
    fileId,
    bundled22().path,
    false,
  );
  assert.equal(result.status, "successful");
  assert.equal(mismatches(fileId).length, 0);
});

test("a failed load-schema keeps the notification", async () => {
  const { fileId } = await open({ autoSave: false });
  const result = await call(
    "franchise:load-schema",
    fileId,
    path.join(tmpDir, "missing.gz"),
    false,
  );
  assert.ok(result.error);
  assert.equal(mismatches(fileId).length, 1);
});

test("close-file removes the file's notifications only", async () => {
  const { fileId } = await open({ autoSave: false });
  const other = store.add({
    kind: "schema-mismatch",
    fileId: "other",
    data: { expected: null, loaded: null, gameType: "madden" },
  });
  await call("franchise:close-file", fileId);
  assert.deepEqual(
    store.list().map((n) => n.id),
    [other.id],
  );
});

test("reopening the same path keeps one notification", async () => {
  const first = await open({ autoSave: false });
  await call("franchise:close-file", first.fileId);
  const second = await open({ autoSave: false });
  assert.equal(store.list().length, 1);
  assert.equal(mismatches(second.fileId).length, 1);
});

test("a missing schema returns code schema-not-found", async () => {
  const result = await open({ autoSave: false, gameYearOverride: 18 }, FTC);
  assert.ok(result.error);
  assert.equal(result.code, "schema-not-found");
  assert.equal(store.list().length, 0);
});

test("a corrupt file returns an error without a code", async () => {
  const bad = path.join(tmpDir, "CORRUPT");
  fs.writeFileSync(bad, Buffer.from("not a franchise file"));
  const result = await open({ autoSave: false }, bad);
  assert.ok(result.error);
  assert.equal(result.code, undefined);
});
