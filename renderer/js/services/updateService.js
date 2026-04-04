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

function addIpcListeners() {
  window.electronAPI.on("checking-for-updates", function () {
    if (!updateService.checkingForUpdatesElement) {
      return;
    }
    showElement(updateService.checkingForUpdatesElement);
  });

  window.electronAPI.on("update-ready", function () {
    if (!updateService.notificationElement) {
      return;
    }
    showElement(updateService.notificationElement);
  });

  window.electronAPI.on("update-not-available", function () {
    if (!updateService.noUpdatesAvailableElement) {
      return;
    }
    showElement(updateService.noUpdatesAvailableElement);

    setTimeout(() => {
      hideNotificationElements();
    }, 3500);
  });

  window.electronAPI.on("update-error", function (err) {
    console.log(err);
    if (!updateService.updateErrorElement) {
      return;
    }
    showElement(updateService.updateErrorElement);
  });

  window.electronAPI.on("update-downloading", function () {
    if (!updateService.downloadProgressElement) {
      return;
    }
    hideNotificationElement(updateService.notificationElement);
    showElement(updateService.downloadProgressElement);
  });

  window.electronAPI.on("update-progress", function (progressObj) {
    if (!updateService.downloadProgressElement) {
      return;
    }
    updateService.downloadProgressElement.querySelector(
      ".percent-complete",
    ).innerHTML = `${progressObj.percent.toFixed(2)}%`;
  });

  window.electronAPI.on("update-downloaded", function () {
    if (!updateService.downloadProgressElement) {
      return;
    }
    updateService.downloadProgressElement.querySelector(
      ".notification-text",
    ).innerHTML = "Installing...";
    updateService.downloadProgressElement.querySelector(
      ".percent-complete",
    ).innerHTML = "";
  });
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
