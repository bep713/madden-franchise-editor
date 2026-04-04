/**
 * Shim for the 'electron' module in the renderer process.
 * With contextIsolation: true, require('electron') doesn't work natively.
 * This shim maps to the APIs exposed via the preload script.
 */

const ipcRenderer = {
  send: (channel, ...args) => {
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send(channel, ...args);
    }
  },
  sendSync: (channel, ...args) => {
    if (window.electronAPI && window.electronAPI.sendSync) {
      return window.electronAPI.sendSync(channel, ...args);
    }
    return null;
  },
  on: (channel, listener) => {
    if (window.electronAPI && window.electronAPI.on) {
      window.electronAPI.on(channel, listener);
    }
  },
  once: (channel, listener) => {
    if (window.electronAPI && window.electronAPI.on) {
      const wrapped = (...args) => {
        listener(...args);
        ipcRenderer.removeListener(channel, wrapped);
      };
      window.electronAPI.on(channel, wrapped);
    }
  },
  removeListener: (channel, listener) => {
    // Note: this is a simplified implementation
    if (window.electronAPI && window.electronAPI.removeAllListeners) {
      window.electronAPI.removeAllListeners(channel);
    }
  },
  removeAllListeners: (channel) => {
    if (window.electronAPI && window.electronAPI.removeAllListeners) {
      window.electronAPI.removeAllListeners(channel);
    }
  },
  invoke: async (channel, ...args) => {
    if (
      window.franchiseAPI &&
      typeof window.franchiseAPI[channel] === "function"
    ) {
      return window.franchiseAPI[channel](...args);
    }
    return null;
  },
};

const shell = {
  openExternal: (url) => {
    window.open(url, "_blank");
  },
  openPath: (path) => {
    // Not available in renderer, no-op
    console.warn("shell.openPath is not available in the renderer process");
  },
  showItemInFolder: (path) => {
    // Not available in renderer, no-op
    console.warn(
      "shell.showItemInFolder is not available in the renderer process",
    );
  },
};

module.exports = {
  ipcRenderer,
  shell,
};
