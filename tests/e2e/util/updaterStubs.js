// Drives the fake updater main uses under NODE_ENV=testing
// (main/services/fakeAutoUpdater.js) through globalThis.__fakeUpdater.

// Merges `values` into the fake's state, creating it if no check ran yet
async function setFakeState(electronApp, values) {
  await electronApp.evaluate((_, v) => {
    globalThis.__fakeUpdater = {
      next: null,
      downloadError: null,
      holdDownload: false,
      checks: 0,
      downloads: 0,
      installs: 0,
      ...globalThis.__fakeUpdater,
      ...v,
    };
  }, values);
}

// What the next check finds: { version }, { error } or null (no update)
async function setNextUpdate(electronApp, next) {
  await setFakeState(electronApp, { next });
}

// The message the next download fails with
async function setDownloadError(electronApp, message) {
  await setFakeState(electronApp, { downloadError: message });
}

// Pauses later downloads at 50% until releaseDownload
async function holdDownload(electronApp) {
  await setFakeState(electronApp, { holdDownload: true });
}

async function releaseDownload(electronApp) {
  await electronApp.evaluate(() => globalThis.__fakeUpdater?.releaseDownload?.());
}

// { checks, downloads, installs }
async function updaterCounts(electronApp) {
  return electronApp.evaluate(() => {
    const state = globalThis.__fakeUpdater || {};
    return {
      checks: state.checks || 0,
      downloads: state.downloads || 0,
      installs: state.installs || 0,
    };
  });
}

module.exports = {
  setNextUpdate,
  setDownloadError,
  holdDownload,
  releaseDownload,
  updaterCounts,
};
