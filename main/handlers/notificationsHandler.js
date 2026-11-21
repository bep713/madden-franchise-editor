/**
 * Registers IPC handlers for the notification store.
 * @param {Object} loggedIpc - Wrapped IPC with dev logging
 * @param {ReturnType<import("../services/notificationStore").createNotificationStore>} store
 * @param {object} [options]
 * @param {(notification: object) => boolean} [options.canDismiss] - False
 *   keeps the notification on a dismiss
 */
function registerNotificationsHandlers(
  loggedIpc,
  store,
  { canDismiss = () => true } = {},
) {
  loggedIpc.handle("notifications:list", async () => store.list());

  loggedIpc.handle("notifications:dismiss", async (event, id) => {
    const notification = store.list().find((n) => n.id === id);
    if (!notification || !canDismiss(notification)) return;
    store.remove(id);
  });

  loggedIpc.handle("notifications:mark-read", async (event, ids) => {
    store.markRead(ids);
  });
}

module.exports = { registerNotificationsHandlers };
