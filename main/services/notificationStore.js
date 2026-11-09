const crypto = require("crypto");

// Windows paths: no case, either slash (schemaList.ts samePath)
function samePath(a, b) {
  if (!a || !b) return false;
  const normalize = (p) => p.replace(/\\/g, "/").toLowerCase();
  return normalize(a) === normalize(b);
}

// Same kind and fileId, or for kinds without a fileId, the same data.path
function sameTarget(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.fileId || b.fileId) return a.fileId === b.fileId;
  return samePath(a.data?.path, b.data?.path);
}

/**
 * In-memory list of app notifications (schema mismatch, ...). Main owns it so
 * the list survives a UI switch; the renderer reads it over IPC and listens for
 * the events sent on every change.
 * @param {(channel: string, payload: any) => void} send - Sends to the main window
 */
function createNotificationStore(send = () => {}) {
  /** @type {Array<object>} oldest first */
  let items = [];

  const list = () => items.slice().reverse();
  const changed = () => send("notifications:changed", list());

  /**
   * Add a notification. Replaces the existing one with the same kind and
   * fileId, or the same kind and data.path when it has no fileId.
   * @param {{ kind: string, fileId?: string, data: object }} notification
   * @returns {object} The stored notification
   */
  function add(notification) {
    items = items.filter((n) => !sameTarget(n, notification));
    const stored = {
      ...notification,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      read: false,
    };
    items.push(stored);
    changed();
    send("notifications:added", stored);
    return stored;
  }

  function removeWhere(predicate) {
    const kept = items.filter((n) => !predicate(n));
    if (kept.length === items.length) return;
    items = kept;
    changed();
  }

  function remove(id) {
    removeWhere((n) => n.id === id);
  }

  function markRead(ids) {
    const set = new Set(Array.isArray(ids) ? ids : []);
    let didChange = false;
    items = items.map((n) => {
      if (!set.has(n.id) || n.read) return n;
      didChange = true;
      return { ...n, read: true };
    });
    if (didChange) changed();
  }

  return { add, remove, removeWhere, markRead, list };
}

module.exports = { createNotificationStore, samePath };
