const { test, mock, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createFileWatcher } = require("../../main/services/fileWatcher");

function fakeChokidar() {
  const watchers = [];
  return {
    watchers,
    watch(path, options) {
      const w = new EventEmitter();
      w.path = path;
      w.options = options;
      w.closed = false;
      w.close = () => {
        w.closed = true;
      };
      watchers.push(w);
      return w;
    },
  };
}

function setup(opts = {}) {
  const chokidar = fakeChokidar();
  const sent = [];
  const added = [];
  // What the store holds now; added is every add
  let items = [];
  const state = { ignore: false };
  const store = {
    add: (n) => {
      added.push(n);
      items = items.filter((i) => !(i.kind === n.kind && i.fileId === n.fileId));
      items.push(n);
    },
    removeWhere: (predicate) => {
      items = items.filter((i) => !predicate(i));
    },
    list: () => items.slice(),
  };
  const watcher = createFileWatcher({
    chokidar,
    send: (channel, payload) => sent.push([channel, payload]),
    store,
    shouldIgnore: () => state.ignore,
    debounceMs: 1000,
    ...opts,
  });
  const kinds = () => items.map((i) => i.kind);
  return { chokidar, sent, added, store, kinds, state, watcher };
}

beforeEach(() => mock.timers.enable({ apis: ["setTimeout"] }));
afterEach(() => mock.timers.reset());

test("debounces the notification, sends file-changed per change", () => {
  const { chokidar, sent, added, watcher } = setup();
  watcher.watch("C:/a.frt", "f1");
  const w = chokidar.watchers[0];
  w.emit("change", "C:/a.frt");
  mock.timers.tick(400);
  w.emit("change", "C:/a.frt");
  mock.timers.tick(400);
  w.emit("change", "C:/a.frt");
  assert.equal(sent.length, 3);
  assert.deepEqual(sent[0], ["file-changed", "C:/a.frt"]);
  assert.equal(added.length, 0);
  mock.timers.tick(1000);
  assert.deepEqual(added, [
    { kind: "file-changed", fileId: "f1", data: { path: "C:/a.frt" } },
  ]);
});

test("ignored at event time does nothing", () => {
  const { chokidar, sent, added, state, watcher } = setup();
  watcher.watch("p", "f1");
  state.ignore = true;
  chokidar.watchers[0].emit("change", "p");
  mock.timers.tick(5000);
  assert.equal(sent.length, 0);
  assert.equal(added.length, 0);
});

test("ignored only at fire time sends but does not add", () => {
  const { chokidar, sent, added, state, watcher } = setup();
  watcher.watch("p", "f1");
  chokidar.watchers[0].emit("change", "p");
  state.ignore = true;
  mock.timers.tick(1000);
  assert.equal(sent.length, 1);
  assert.equal(added.length, 0);
});

test("close before the timer fires adds nothing", () => {
  const { chokidar, added, watcher } = setup();
  watcher.watch("p", "f1");
  const w = chokidar.watchers[0];
  w.emit("change", "p");
  watcher.close();
  mock.timers.tick(2000);
  assert.equal(w.closed, true);
  assert.equal(added.length, 0);
});

test("a change after close is ignored", () => {
  const { chokidar, sent, added, watcher } = setup();
  watcher.watch("p", "f1");
  const w = chokidar.watchers[0];
  watcher.close();
  w.emit("change", "p");
  mock.timers.tick(2000);
  assert.equal(sent.length, 0);
  assert.equal(added.length, 0);
});

test("watch again closes the old watcher and its timer", () => {
  const { chokidar, added, watcher } = setup();
  watcher.watch("a", "f1");
  chokidar.watchers[0].emit("change", "a");
  watcher.watch("b", "f1");
  assert.equal(chokidar.watchers[0].closed, true);
  assert.equal(chokidar.watchers.length, 2);
  mock.timers.tick(2000);
  assert.equal(added.length, 0);
  chokidar.watchers[1].emit("change", "b");
  mock.timers.tick(1000);
  assert.equal(added.length, 1);
  assert.equal(added[0].data.path, "b");
});

test("watch skips the initial scan's add", () => {
  const { chokidar, watcher } = setup();
  watcher.watch("p", "f1");
  assert.deepEqual(chokidar.watchers[0].options, { ignoreInitial: true });
});

test("unlink adds file-missing right away and sends nothing to v4", () => {
  const { chokidar, sent, added, watcher } = setup();
  watcher.watch("C:/a.frt", "f1");
  chokidar.watchers[0].emit("unlink", "C:/a.frt");
  assert.deepEqual(added, [
    { kind: "file-missing", fileId: "f1", data: { path: "C:/a.frt" } },
  ]);
  assert.equal(sent.length, 0);
});

test("change then unlink inside the debounce keeps only file-missing", () => {
  const { chokidar, kinds, watcher } = setup();
  watcher.watch("p", "f1");
  const w = chokidar.watchers[0];
  w.emit("change", "p");
  mock.timers.tick(500);
  w.emit("unlink", "p");
  mock.timers.tick(2000);
  assert.deepEqual(kinds(), ["file-missing"]);
});

test("unlink replaces an existing file-changed", () => {
  const { chokidar, store, kinds, watcher } = setup();
  watcher.watch("p", "f1");
  store.add({ kind: "file-changed", fileId: "f1", data: { path: "p" } });
  store.add({ kind: "file-changed", fileId: "f2", data: { path: "q" } });
  chokidar.watchers[0].emit("unlink", "p");
  assert.deepEqual(kinds(), ["file-changed", "file-missing"]);
  assert.equal(store.list().find((n) => n.kind === "file-changed").fileId, "f2");
});

test("unlink then add swaps file-missing for file-changed after the debounce", () => {
  const { chokidar, sent, kinds, watcher } = setup();
  watcher.watch("p", "f1");
  const w = chokidar.watchers[0];
  w.emit("unlink", "p");
  w.emit("add", "p");
  assert.equal(sent.length, 0);
  assert.deepEqual(kinds(), ["file-missing"]);
  mock.timers.tick(1000);
  assert.deepEqual(kinds(), ["file-changed"]);
});

test("unlink and add are ignored during our own save", () => {
  const { chokidar, added, state, watcher } = setup();
  watcher.watch("p", "f1");
  state.ignore = true;
  const w = chokidar.watchers[0];
  w.emit("unlink", "p");
  w.emit("add", "p");
  mock.timers.tick(2000);
  assert.equal(added.length, 0);
});

test("unlink and add after close are ignored", () => {
  const { chokidar, added, watcher } = setup();
  watcher.watch("p", "f1");
  const w = chokidar.watchers[0];
  watcher.close();
  w.emit("unlink", "p");
  w.emit("add", "p");
  mock.timers.tick(2000);
  assert.equal(added.length, 0);
});
