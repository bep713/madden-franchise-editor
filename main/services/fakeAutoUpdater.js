// Stand-in for electron-updater under NODE_ENV=testing, so tests never hit
// the network. Tests drive it through globalThis.__fakeUpdater:
//   next: null (no update) | { version } | { error }
//   downloadError: message the next download fails with (optional)
//   holdDownload: true pauses a download at 50% until releaseDownload() is
//     called (set by the download while it waits)
//   checks / downloads / installs: call counts
// quitAndInstall only counts; it doesn't quit.
const { EventEmitter } = require("events");

function getState() {
  if (!globalThis.__fakeUpdater) {
    globalThis.__fakeUpdater = {
      next: null,
      downloadError: null,
      holdDownload: false,
      checks: 0,
      downloads: 0,
      installs: 0,
    };
  }
  return globalThis.__fakeUpdater;
}

function createFakeAutoUpdater() {
  const updater = new EventEmitter();
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;

  updater.checkForUpdates = async () => {
    const state = getState();
    state.checks++;
    updater.emit("checking-for-update");
    await Promise.resolve();
    const next = state.next;
    if (next?.error) {
      const error = new Error(next.error);
      updater.emit("error", error);
      throw error;
    }
    if (next?.version) {
      const updateInfo = { version: next.version, releaseName: next.version };
      updater.emit("update-available", updateInfo);
      return { updateInfo };
    }
    updater.emit("update-not-available", {});
    return null;
  };

  updater.downloadUpdate = async () => {
    const state = getState();
    state.downloads++;
    await Promise.resolve();
    if (state.downloadError) {
      const error = new Error(state.downloadError);
      updater.emit("error", error);
      throw error;
    }
    if (state.holdDownload) {
      updater.emit("download-progress", {
        bytesPerSecond: 1,
        percent: 50,
        transferred: 1,
        total: 2,
      });
      await new Promise((resolve) => {
        state.releaseDownload = resolve;
      });
    }
    updater.emit("download-progress", {
      bytesPerSecond: 1,
      percent: 100,
      transferred: 1,
      total: 1,
    });
    updater.emit("update-downloaded", {});
    return [];
  };

  updater.quitAndInstall = () => {
    getState().installs++;
  };

  return updater;
}

module.exports = { createFakeAutoUpdater, getState };
