// Owns the updater state: checks, the install flow, and the last status a
// user acts on (so a reloaded or switched UI can show it again).
//
// Every renderer event goes through emit(). Checks are tagged { manual } so
// the UI can stay quiet for automatic ones.

// Events a reloaded UI should show again. Any other event clears the status.
const KEPT_EVENTS = new Set([
  "update-ready",
  "update-downloading",
  "update-progress",
  "update-downloaded",
  "update-error",
]);

const BUSY_PHASES = new Set(["preparing", "downloading", "downloaded"]);

function createUpdateController({
  getAutoUpdater,
  isUpdaterLoaded,
  send,
  getVersion,
  prepareInstall = async () => true,
  onUpdateAvailable = () => {},
  onNoUpdate = () => {},
}) {
  // idle | checking | preparing | downloading | downloaded
  let phase = "idle";
  let checkManual = false;
  // The update-available info of the last check, or null if none was offered.
  let offered = null;
  let kept = null;
  // Set when the updater's error event reported the current operation's
  // failure, so the rejected promise doesn't report it again.
  let errorReported = false;

  function emit(channel, data) {
    kept = KEPT_EVENTS.has(channel) ? { channel, data } : null;
    if (data === undefined) send(channel);
    else send(channel, data);
  }

  function errorPhase() {
    return BUSY_PHASES.has(phase) ? "download" : "check";
  }

  function emitError(error, errPhase = errorPhase()) {
    errorReported = true;
    emit("update-error", {
      message: error?.message || String(error),
      manual: errPhase === "download" ? true : checkManual,
      phase: errPhase,
    });
  }

  function attach(autoUpdater) {
    autoUpdater.on("checking-for-update", () => {
      if (!BUSY_PHASES.has(phase)) phase = "checking";
      emit("checking-for-updates", { manual: checkManual });
    });

    autoUpdater.on("update-available", (info) => {
      offered = info || {};
      if (phase === "checking") phase = "idle";
      emit("update-ready", {
        version: info?.version,
        currentVersion: getVersion(),
        // Channel of the offered build, not the user's preference: nightly users are also offered stable releases.
        channel: /-nightly\./.test(info?.version || "") ? "nightly" : "stable",
        releaseName: info?.releaseName,
        manual: checkManual,
      });
      onUpdateAvailable(info);
    });

    autoUpdater.on("update-not-available", () => {
      offered = null;
      if (phase === "checking") phase = "idle";
      emit("update-not-available", { manual: checkManual });
      onNoUpdate();
    });

    autoUpdater.on("error", (err) => {
      const errPhase = errorPhase();
      emitError(err, errPhase);
      // Back to "offered" (or nothing offered) so the user can retry.
      phase = "idle";
    });

    autoUpdater.on("download-progress", (progressObj) => {
      emit("update-progress", progressObj);
    });

    autoUpdater.on("update-downloaded", () => {
      if (phase === "downloading") phase = "downloaded";
      emit("update-downloaded");
    });
  }

  function reemitDownload() {
    send("update-downloading");
    if (
      kept &&
      (kept.channel === "update-progress" ||
        kept.channel === "update-downloaded")
    ) {
      send(kept.channel, kept.data);
    }
  }

  function check({ manual = false } = {}) {
    if (BUSY_PHASES.has(phase)) {
      // Don't check during an install; a manual check shows the download again.
      if (manual) reemitDownload();
      return;
    }
    if (phase === "checking") {
      // One check at a time. A manual check during an automatic one still
      // reports its result.
      if (manual && !checkManual) {
        checkManual = true;
        emit("checking-for-updates", { manual: true });
      }
      return;
    }

    phase = "checking";
    checkManual = manual;
    errorReported = false;

    const onFailure = (error) => {
      console.error("Failed to check for updates:", error);
      if (!errorReported) emitError(error, "check");
      if (phase === "checking") phase = "idle";
    };

    try {
      const result = getAutoUpdater().checkForUpdates();
      if (result && typeof result.then === "function") {
        result.then(
          () => {
            if (phase === "checking") phase = "idle";
          },
          onFailure,
        );
      } else if (phase === "checking") {
        // null: the updater skipped the check (e.g. not packaged)
        phase = "idle";
      }
    } catch (error) {
      onFailure(error);
    }
  }

  async function install() {
    if (BUSY_PHASES.has(phase)) return;
    if (!offered) {
      emitError(new Error("No update is available to install."), "download");
      return;
    }

    phase = "preparing";
    try {
      if (!(await prepareInstall())) {
        phase = "idle";
        return;
      }
    } catch (error) {
      console.error("Failed to prepare the update install:", error);
      emitError(error, "download");
      phase = "idle";
      return;
    }

    phase = "downloading";
    errorReported = false;
    emit("update-downloading");
    const autoUpdater = getAutoUpdater();
    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error("Failed to download update:", error);
      if (!errorReported) emitError(error, "download");
      phase = "idle";
      return;
    }
    // The error event may already have reset the phase.
    if (!BUSY_PHASES.has(phase)) return;

    try {
      autoUpdater.quitAndInstall();
    } catch (error) {
      console.error("Failed to install update:", error);
      emitError(error, "download");
      phase = "idle";
    }
  }

  function getStatus() {
    if (!isUpdaterLoaded()) return null;
    return kept;
  }

  return { attach, check, install, getStatus };
}

module.exports = { createUpdateController };
