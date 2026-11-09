/**
 * Registers IPC handlers for the notification store.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {ReturnType<import("../services/notificationStore").createNotificationStore>} store
 */
function registerNotificationsHandlers(loggedIpc, store) {
  loggedIpc.handle("notifications:list", async () => store.list());

  loggedIpc.handle("notifications:dismiss", async (event, id) => {
    store.remove(id);
  });

  loggedIpc.handle("notifications:mark-read", async (event, ids) => {
    store.markRead(ids);
  });
}

module.exports = { registerNotificationsHandlers };
