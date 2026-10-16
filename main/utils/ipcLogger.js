const log = require("electron-log");

const isDev = process.env.NODE_ENV === "development";

/**
 * Creates a wrapped ipcMain object that logs all IPC messages in dev mode.
 * @param {Electron.IpcMain} ipcMain
 * @returns {Object} Wrapped ipcMain with logged handle/on methods
 */
function createLoggedIpcMain(ipcMain) {
  return {
    emit(eventName, ...args) {
      log.debug(`[Main] ${eventName}`);
      ipcMain.emit(eventName, ...args);
    },
    handle(channel, handler) {
      return ipcMain.handle(channel, async (event, ...args) => {
        if (isDev) {
          // log.debug(`[IPC -> Main] ${channel}`, args);
        }
        try {
          const result = await handler(event, ...args);
          if (isDev) {
            log.debug(`[IPC <- Main] ${channel} (success)`);
          }
          return result;
        } catch (error) {
          if (isDev) {
            log.debug(`[IPC <- Main] ${channel} (error): ${error.message}`);
          }
          throw error;
        }
      });
    },

    on(channel, handler) {
      return ipcMain.on(channel, (event, ...args) => {
        if (isDev) {
          log.debug(`[IPC -> Main] ${channel} (fire-and-forget)`, args);
        }
        return handler(event, ...args);
      });
    },
  };
}

/**
 * Creates a wrapped webContents object that logs all send calls in dev mode.
 * @param {Electron.WebContents} webContents
 * @returns {Object} Wrapped webContents with logged send method
 */
function createLoggedWebContents(webContents) {
  return {
    send(channel, ...args) {
      if (isDev) {
        log.debug(`[IPC -> Renderer] ${channel}`, args);
      }
      return webContents.send(channel, ...args);
    },
  };
}

/**
 * Wraps event.sender.send for handlers that use it directly.
 * @param {Electron.IpcMainEvent} event
 * @returns {Object} Wrapped sender with logged send method
 */
function wrapSenderSend(event) {
  const originalSend = event.sender.send.bind(event.sender);
  return {
    send(channel, ...args) {
      if (isDev) {
        log.debug(`[IPC -> Renderer] ${channel} (via sender)`, args);
      }
      return originalSend(channel, ...args);
    },
  };
}

module.exports = {
  createLoggedIpcMain,
  createLoggedWebContents,
  wrapSenderSend,
};
