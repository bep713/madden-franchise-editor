const HIDDEN_CLASS = "hidden";
const BASE_CLASS = "update-wrapper";
const CHECK_FOR_UPDATES_BASE_CLASS = "first-update-wrapper";
const NO_UPDATES_AVAILABLE_BASE_CLASS = "no-updates-available-wrapper";
const CHECKING_FOR_UPDATES_BASE_CLASS = "checking-for-updates-wrapper";
const WRAPPER_HIDDEN_CLASS = "notification-wrapper--hidden";
const preferencesService = require("./preferencesService");

let updateService = {};
addIpcListeners();

updateService.initialize = () => {
  const updateWrapper = document.querySelector(`.${BASE_CLASS}`);
  const checkForUpdatesWrapper = document.querySelector(
    `.${CHECK_FOR_UPDATES_BASE_CLASS}`,
  );
  const noUpdatesAvailableWrapper = document.querySelector(
    `.${NO_UPDATES_AVAILABLE_BASE_CLASS}`,
  );
  const checkingForUpdatesWrapper = document.querySelector(
    `.${CHECKING_FOR_UPDATES_BASE_CLASS}`,
  );
  const updateErrorWrapper = document.querySelector(".update-error-wrapper");
  const downloadProgressWrapper = document.querySelector(
    ".download-progress-wrapper",
  );

  updateService.notificationElement = updateWrapper;
  hideElementImmediately(updateWrapper);

  updateService.checkForUpdatesElement = checkForUpdatesWrapper;
  hideElementImmediately(checkForUpdatesWrapper);

  updateService.noUpdatesAvailableElement = noUpdatesAvailableWrapper;
  hideElementImmediately(noUpdatesAvailableWrapper);

  updateService.checkingForUpdatesElement = checkingForUpdatesWrapper;
  hideElementImmediately(checkingForUpdatesWrapper);

  updateService.updateErrorElement = updateErrorWrapper;
  hideElementImmediately(updateErrorWrapper);

  updateService.downloadProgressElement = downloadProgressWrapper;
  hideElementImmediately(downloadProgressWrapper);

  addEventListeners();
  restoreUpdateStatus();
};

updateService.showCheckForUpdatesNotification = () => {
  showElement(updateService.checkForUpdatesElement);
};

updateService.hide = () => {
  hideNotificationElements();
};

module.exports = updateService;

function hideElementImmediately(element) {
  if (!element) {
    return;
  }
  element.classList.add(HIDDEN_CLASS);
  element.classList.add(WRAPPER_HIDDEN_CLASS);
}

// A function, not a const: addIpcListeners runs at module load, above this.
function getUpdateHandlers() {
  return {
    "checking-for-updates": onCheckingForUpdates,
    "update-ready": onUpdateReady,
    "update-not-available": onUpdateNotAvailable,
    "update-error": onUpdateError,
    "update-downloading": onUpdateDownloading,
    "update-progress": onUpdateProgress,
    "update-downloaded": onUpdateDownloaded,
  };
}

function addIpcListeners() {
  Object.entries(getUpdateHandlers()).forEach(([channel, handler]) => {
    window.electronAPI.on(channel, handler);
  });
}

// A reloaded page (UI switch) missed the updater events; main keeps the last
// one a user acts on, so show it again.
async function restoreUpdateStatus() {
  try {
    const status = await window.electronAPI.getUpdateStatus();
    if (!status) return;
    // progress/downloaded update the download notification, which the
    // update-downloading event normally shows first
    if (
      status.channel === "update-progress" ||
      status.channel === "update-downloaded"
    ) {
      onUpdateDownloading();
    }
    getUpdateHandlers()[status.channel]?.(status.data);
  } catch (err) {
    console.error("Error restoring the update status:", err);
  }
}

function onCheckingForUpdates() {
  if (!updateService.checkingForUpdatesElement) {
    return;
  }
  showElement(updateService.checkingForUpdatesElement);
}

function onUpdateReady(info) {
  if (!updateService.notificationElement) {
    return;
  }

  if (info && info.version) {
    const textElement =
      updateService.notificationElement.querySelector(".update-ready-text");
    if (textElement) {
      const label = info.channel === "nightly" ? "Nightly build" : "Version";
      textElement.textContent = `${label} ${info.version} is available (you have ${info.currentVersion}). It will take less than 5 minutes to install.`;
    }
  }

  showElement(updateService.notificationElement);
}

function onUpdateNotAvailable() {
  if (!updateService.noUpdatesAvailableElement) {
    return;
  }
  showElement(updateService.noUpdatesAvailableElement);

  setTimeout(() => {
    hideNotificationElements();
  }, 3500);
}

function onUpdateError(err) {
  console.log(err);
  if (!updateService.updateErrorElement) {
    return;
  }
  showElement(updateService.updateErrorElement);
}

function onUpdateDownloading() {
  if (!updateService.downloadProgressElement) {
    return;
  }
  hideNotificationElement(updateService.notificationElement);
  showElement(updateService.downloadProgressElement);
}

function onUpdateProgress(progressObj) {
  if (!updateService.downloadProgressElement) {
    return;
  }
  updateService.downloadProgressElement.querySelector(
    ".percent-complete",
  ).innerHTML = `${progressObj.percent.toFixed(2)}%`;
}

function onUpdateDownloaded() {
  if (!updateService.downloadProgressElement) {
    return;
  }
  updateService.downloadProgressElement.querySelector(
    ".notification-text",
  ).innerHTML = "Installing...";
  updateService.downloadProgressElement.querySelector(
    ".percent-complete",
  ).innerHTML = "";
}

function showElement(element) {
  if (!element) {
    return;
  }

  element.classList.remove(HIDDEN_CLASS);
  setTimeout(() => {
    element.classList.remove(WRAPPER_HIDDEN_CLASS);
  }, 20);
}

function addEventListeners() {
  if (!updateService.notificationElement) {
    return;
  }

  const reloadAction =
    updateService.notificationElement.querySelector(".primary-button");
  reloadAction.addEventListener("click", function () {
    hideNotificationElement(updateService.checkingForUpdatesElement);
    window.electronAPI.update.install();
  });

  const dismissAction =
    updateService.notificationElement.querySelector(".dismiss-action");
  dismissAction.addEventListener("click", function () {
    hideNotificationElements();
  });

  if (!updateService.checkForUpdatesElement) {
    return;
  }
  const yesAction =
    updateService.checkForUpdatesElement.querySelector(".primary-button");
  yesAction.addEventListener("click", function () {
    hideNotificationElements();

    setTimeout(() => {
      const preferences = getPreferences();
      preferences.general.checkForUpdates = [true];
      setPreferences(preferences);
      window.electronAPI.update.check();
    }, 10);
  });

  const noAction =
    updateService.checkForUpdatesElement.querySelector(".dismiss-action");
  noAction.addEventListener("click", function () {
    const preferences = getPreferences();
    preferences.general.checkForUpdates = [];
    setPreferences(preferences);
    hideNotificationElements();
  });

  if (!updateService.updateErrorElement) {
    return;
  }
  const updateManuallyAction =
    updateService.updateErrorElement.querySelector(".primary-button");
  updateManuallyAction.addEventListener("click", async function () {
    await window.electronAPI.update.openReleasePage();
    hideNotificationElements();
  });

  const errorDismissAction =
    updateService.updateErrorElement.querySelector(".dismiss-action");
  errorDismissAction.addEventListener("click", function () {
    hideNotificationElements();
  });
}

function setPreferences(preferences) {
  preferencesService.setAll(preferences);
}

function getPreferences() {
  const prefs = preferencesService.get();
  if (!prefs) {
    return preferencesService.getPreferenceKeys();
  }
  return prefs;
}

function hideNotificationElements() {
  document.querySelectorAll(".notification-wrapper").forEach((element) => {
    hideNotificationElement(element);
  });
}

function hideNotificationElement(element) {
  if (!element) {
    return;
  }
  element.classList.add(WRAPPER_HIDDEN_CLASS);

  setTimeout(() => {
    element.classList.add(HIDDEN_CLASS);
  }, 300);
}
