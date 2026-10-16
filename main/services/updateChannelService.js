const { app } = require("electron");

const STABLE_RELEASES_URL =
  "https://github.com/bep713/madden-franchise-editor/releases";
const NIGHTLY_RELEASE_URL =
  "https://github.com/bep713/madden-franchise-editor/releases/tag/nightly";

/**
 * Get the currently selected update channel. Unknown values are stable.
 */
function getUpdateChannel() {
  // Required lazily to avoid any require cycle with the preferences handler.
  const preferencesHandler = require("../handlers/preferencesHandler");
  const preferencesInstance = preferencesHandler.getPreferencesInstance();
  const value = preferencesInstance?.value("general.updateChannel");
  return value === "nightly" ? "nightly" : "stable";
}

/**
 * Configure electron-updater for the given channel.
 * electron-updater 4.6.1's GitHub provider ignores `channel`, so it is never
 * set here (its setter would also force allowDowngrade = true).
 */
function applyUpdateChannel(autoUpdater, channel) {
  if (channel === "nightly") {
    autoUpdater.allowPrerelease = true;
    autoUpdater.allowDowngrade = false;
  } else {
    autoUpdater.allowPrerelease = false;
    // Only allow a downgrade when the running build is a prerelease.
    autoUpdater.allowDowngrade = /-/.test(app.getVersion());
  }
}

function getReleasePageUrl(channel) {
  return channel === "nightly" ? NIGHTLY_RELEASE_URL : STABLE_RELEASES_URL;
}

module.exports = { getUpdateChannel, applyUpdateChannel, getReleasePageUrl };
