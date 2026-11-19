/**
 * Registers IPC handlers for the notification store.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {ReturnType<import("../services/notificationStore").createNotificationStore>} store
 * @param {object} [options]
 * @param {(notification: object) => void} [options.onDismissed] - Called with a
 *   notification the user dismissed, after it is removed
 */
function registerNotificationsHandlers(loggedIpc, store, { onDismissed } = {}) {
  loggedIpc.handle("notifications:list", async () => store.list());

  loggedIpc.handle("notifications:dismiss", async (event, id) => {
    const notification = store.list().find((n) => n.id === id);
    if (!notification) return;
    store.remove(id);
    onDismissed?.(notification);
  });

  loggedIpc.handle("notifications:mark-read", async (event, ids) => {
    store.markRead(ids);
  });
}

module.exports = { registerNotificationsHandlers };
