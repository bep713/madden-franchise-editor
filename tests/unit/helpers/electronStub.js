// Stubs require("electron") so main-process modules can be loaded under
// node:test. Require this file before the module under test.
const Module = require("module");
const fs = require("fs");
const os = require("os");
const path = require("path");

const paths = {};

function getPath(name) {
  if (!paths[name]) {
    paths[name] = fs.mkdtempSync(path.join(os.tmpdir(), `mfe-unit-${name}-`));
  }
  return paths[name];
}

const noop = () => {};

const electronStub = {
  app: {
    getPath,
    getVersion: () => require("../../../package.json").version,
    getAppPath: () => path.resolve(__dirname, "../../.."),
    isPackaged: false,
    on: noop,
    whenReady: () => Promise.resolve(),
  },
  ipcMain: { on: noop, handle: noop, removeHandler: noop },
  webContents: { getAllWebContents: () => [] },
  dialog: {
    showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
    showSaveDialog: async () => ({ canceled: true }),
    showMessageBox: async () => ({ response: 0 }),
    showOpenDialogSync: () => undefined,
  },
  shell: { openExternal: async () => {}, openPath: async () => "" },
  BrowserWindow: class {
    static getAllWindows() {
      return [];
    }
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "electron") return electronStub;
  return originalLoad.call(this, request, parent, isMain);
};

/** Point app.getPath(name) at a directory (e.g. a fresh temp dir per test). */
function setPath(name, dir) {
  paths[name] = dir;
}

/** Captures ipc.handle(channel, fn) registrations; call them with invoke(). */
function fakeLoggedIpc() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, fn) {
      handlers.set(channel, fn);
    },
    on(channel, fn) {
      handlers.set(channel, fn);
    },
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) throw new Error(`No handler registered for ${channel}`);
      return fn({ sender: { send: noop } }, ...args);
    },
  };
}

/** Records loggedMain.send(channel, payload) calls in `sent`. */
function fakeLoggedMain() {
  const sent = [];
  return {
    sent,
    send(channel, ...args) {
      sent.push({ channel, args });
    },
  };
}

module.exports = { electronStub, setPath, fakeLoggedIpc, fakeLoggedMain };
