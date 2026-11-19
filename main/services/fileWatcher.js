/**
 * Watches the open file for changes made outside the editor, and for it being
 * deleted or moved away (file-missing) and coming back.
 * @param {object} options
 * @param {(channel: string, payload: any) => void} options.send - Sends to the main window
 * @param {{ add: (n: object) => any, removeWhere: (predicate: (n: object) => boolean) => void }} [options.store] - Notification store
 * @param {() => boolean} [options.shouldIgnore] - True while a save of ours is pending
 * @param {number} [options.debounceMs] - Trailing debounce before the notification
 * @param {object} [options.chokidar] - chokidar module, for tests
 */
function createFileWatcher({
  send,
  store,
  shouldIgnore = () => false,
  debounceMs = 1000,
  chokidar,
} = {}) {
  let watcher = null;
  let timer = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function close() {
    clearTimer();
    if (watcher) {
      const closing = watcher;
      watcher = null;
      closing.close();
    }
  }

  function watch(path, fileId) {
    close();

    // chokidar is required here, not at startup, to keep it off the boot path.
    const lib = chokidar || require("chokidar");
    // The initial scan's add for the file isn't a change
    const current = lib.watch(path, { ignoreInitial: true });
    watcher = current;
    const ofKind = (kind) => (n) => n.kind === kind && n.fileId === fileId;

    // A change queued by a watcher that was already closed, or our own save
    const ignored = () => watcher !== current || shouldIgnore();

    function schedule() {
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (ignored()) return;
        // Same tick, so auto-save never sees neither notification
        store?.removeWhere(ofKind("file-missing"));
        store?.add({ kind: "file-changed", fileId, data: { path } });
      }, debounceMs);
    }

    current.on("change", (changedPath) => {
      if (ignored()) return;
      send("file-changed", changedPath);
      schedule();
    });
    // The file came back; the paired change already told v4
    current.on("add", () => {
      if (ignored()) return;
      schedule();
    });
    // chokidar already waits ~100ms before unlink, so no debounce. v4 isn't told.
    current.on("unlink", () => {
      if (ignored()) return;
      clearTimer();
      store?.removeWhere(ofKind("file-changed"));
      store?.add({ kind: "file-missing", fileId, data: { path } });
    });
  }

  return { watch, close };
}

module.exports = { createFileWatcher };
