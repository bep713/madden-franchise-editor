/**
 * Watches the open file for changes made outside the editor.
 * @param {object} options
 * @param {(channel: string, payload: any) => void} options.send - Sends to the main window
 * @param {{ add: (n: object) => any }} [options.store] - Notification store
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
    const current = lib.watch(path);
    watcher = current;
    current.on("change", (changedPath) => {
      // A change queued by a watcher that was already closed
      if (watcher !== current) return;
      if (shouldIgnore()) return;
      send("file-changed", changedPath);
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (watcher !== current || shouldIgnore()) return;
        store?.add({ kind: "file-changed", fileId, data: { path } });
      }, debounceMs);
    });
  }

  return { watch, close };
}

module.exports = { createFileWatcher };
