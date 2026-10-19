const {
  getUpdateChannel,
  applyUpdateChannel,
} = require("./updateChannelService");

// electron-updater takes ~140ms to require, so it is loaded on first use
// (the first update check) instead of at startup.
let autoUpdater = null;
const createCallbacks = [];

/**
 * Register a callback that receives the updater once, when it is first loaded.
 */
function onCreate(cb) {
  createCallbacks.push(cb);
}

function getAutoUpdater() {
  if (!autoUpdater) {
    autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.autoDownload = false;
    applyUpdateChannel(autoUpdater, getUpdateChannel());
    for (const cb of createCallbacks) cb(autoUpdater);
  }
  return autoUpdater;
}

function isLoaded() {
  return autoUpdater !== null;
}

module.exports = { getAutoUpdater, isLoaded, onCreate };
