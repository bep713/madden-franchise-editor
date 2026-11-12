// In-memory notification store: add/replace/remove/markRead and the events sent.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createNotificationStore,
} = require("../../main/services/notificationStore");

function setup() {
  const sent = [];
  const store = createNotificationStore((channel, payload) =>
    sent.push({ channel, payload }),
  );
  return { store, sent };
}

const mismatch = (fileId) => ({
  kind: "schema-mismatch",
  fileId,
  data: { expected: null, loaded: null, gameType: "madden" },
});

test("add fills id, createdAt and read", () => {
  const { store } = setup();
  const before = Date.now();
  const n = store.add(mismatch("1"));
  assert.equal(typeof n.id, "string");
  assert.ok(n.id.length > 0);
  assert.ok(n.createdAt >= before && n.createdAt <= Date.now());
  assert.equal(n.read, false);
  assert.equal(n.kind, "schema-mismatch");
  assert.equal(n.fileId, "1");
  assert.deepEqual(store.list(), [n]);
});

test("add replaces the same kind and fileId and sorts it newest", () => {
  const { store } = setup();
  const a = store.add(mismatch("1"));
  const b = store.add(mismatch("2"));
  const a2 = store.add(mismatch("1"));
  assert.notEqual(a2.id, a.id);
  assert.deepEqual(
    store.list().map((n) => n.id),
    [a2.id, b.id],
  );
});

test("add replaces the same kind and path when there is no fileId", () => {
  const { store } = setup();
  const missing = (path) => ({ kind: "schema-missing", data: { path } });
  const a = store.add(missing("C:\\saves\\FTC"));
  const b = store.add(missing("C:\\saves\\OTHER"));
  const a2 = store.add(missing("c:/SAVES/ftc"));
  assert.deepEqual(
    store.list().map((n) => n.id),
    [a2.id, b.id],
  );
  assert.notEqual(a2.id, a.id);
});

test("a kind with neither fileId nor path keeps one entry", () => {
  const { store } = setup();
  const update = (version) => ({
    kind: "update-available",
    data: { version, currentVersion: "1.0.0", channel: "stable" },
  });
  const missing = store.add({ kind: "schema-missing", data: { path: "C:\a" } });
  const changed = store.add({ kind: "file-changed", fileId: "1", data: { path: "C:\a" } });
  store.add(update("2.0.0"));
  const latest = store.add(update("2.1.0"));
  assert.deepEqual(
    store.list().map((n) => n.id),
    [latest.id, changed.id, missing.id],
  );
  assert.equal(latest.data.version, "2.1.0");
});

test("list is newest first", () => {
  const { store } = setup();
  const a = store.add(mismatch("1"));
  const b = store.add(mismatch("2"));
  const c = store.add(mismatch("3"));
  assert.deepEqual(
    store.list().map((n) => n.id),
    [c.id, b.id, a.id],
  );
});

test("remove and removeWhere", () => {
  const { store } = setup();
  const a = store.add(mismatch("1"));
  const b = store.add(mismatch("2"));
  store.add(mismatch("3"));
  store.remove(a.id);
  assert.equal(store.list().length, 2);
  store.removeWhere((n) => n.fileId !== "2");
  assert.deepEqual(
    store.list().map((n) => n.id),
    [b.id],
  );
});

test("markRead marks only the given ids", () => {
  const { store } = setup();
  const a = store.add(mismatch("1"));
  const b = store.add(mismatch("2"));
  store.markRead([a.id]);
  const byId = Object.fromEntries(store.list().map((n) => [n.id, n.read]));
  assert.equal(byId[a.id], true);
  assert.equal(byId[b.id], false);
});

test("unknown ids and no-op changes send nothing", () => {
  const { store, sent } = setup();
  const a = store.add(mismatch("1"));
  store.markRead([a.id]);
  sent.length = 0;
  store.remove("nope");
  store.removeWhere(() => false);
  store.markRead(["nope"]);
  store.markRead([a.id]); // already read
  assert.deepEqual(sent, []);
});

test("add sends changed then added; other changes send changed", () => {
  const { store, sent } = setup();
  const a = store.add(mismatch("1"));
  assert.deepEqual(
    sent.map((s) => s.channel),
    ["notifications:changed", "notifications:added"],
  );
  assert.deepEqual(sent[0].payload, [a]);
  assert.deepEqual(sent[1].payload, a);

  sent.length = 0;
  store.markRead([a.id]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, "notifications:changed");
  assert.equal(sent[0].payload[0].read, true);

  sent.length = 0;
  store.remove(a.id);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].payload, []);
});
