const { ipcRenderer, shell } = require('electron');
const HIDDEN_CLASS = 'hidden';
const BASE_CLASS = 'update-wrapper';
const CHECK_FOR_UPDATES_BASE_CLASS = 'first-update-wrapper';
const NO_UPDATES_AVAILABLE_BASE_CLASS = 'no-updates-available-wrapper';
const CHECKING_FOR_UPDATES_BASE_CLASS = 'checking-for-updates-wrapper';
const WRAPPER_HIDDEN_CLASS = 'notification-wrapper--hidden';

let updateService = {};
addIpcListeners();

updateService.initialize = () => {
  const updateWrapper = document.querySelector(`.${BASE_CLASS}`);
  const checkForUpdatesWrapper = document.querySelector(`.${CHECK_FOR_UPDATES_BASE_CLASS}`);
  const noUpdatesAvailableWrapper = document.querySelector(`.${NO_UPDATES_AVAILABLE_BASE_CLASS}`);
  const checkingForUpdatesWrapper = document.querySelector(`.${CHECKING_FOR_UPDATES_BASE_CLASS}`);
  const updateErrorWrapper = document.querySelector('.update-error-wrapper');

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
  if (!element) { return; }
  element.classList.add(HIDDEN_CLASS);
  element.classList.add(WRAPPER_HIDDEN_CLASS);
}

function addIpcListeners() {
  ipcRenderer.on('checking-for-updates', function () {
    if (!updateService.checkingForUpdatesElement) { return; }
    showElement(updateService.checkingForUpdatesElement);
  });

  ipcRenderer.on('update-ready', function () {
    if (!updateService.notificationElement) { return; }
    showElement(updateService.notificationElement);
  });

  ipcRenderer.on('update-not-available', function () {
    if (!updateService.noUpdatesAvailableElement) { return; }
    showElement(updateService.noUpdatesAvailableElement);

    setTimeout(() => {
      hideNotificationElements();
    }, 3500);
  });

  ipcRenderer.on('update-error', function () {
    if (!updateService.updateErrorElement) { return; }
    showElement(updateService.updateErrorElement);
  });
};

function showElement(element) {
  if (!element) { return; }

  element.classList.remove(HIDDEN_CLASS);
  setTimeout(() => {
    element.classList.remove(WRAPPER_HIDDEN_CLASS);
  }, 20);
}

function addEventListeners() {
  if (!updateService.notificationElement) { return; }
  
  const reloadAction = updateService.notificationElement.querySelector('.primary-button');
  reloadAction.addEventListener('click', function () {
    ipcRenderer.send('install-update');
    hideNotificationElements();
  });

  const dismissAction = updateService.notificationElement.querySelector('.dismiss-action');
  dismissAction.addEventListener('click', function () {
    hideNotificationElements();
  });

  if (!updateService.checkForUpdatesElement) { return; }
  const yesAction = updateService.checkForUpdatesElement.querySelector('.primary-button');
  yesAction.addEventListener('click', function () {
    hideNotificationElements();

    setTimeout(() => {
      const preferences = getPreferences();
      preferences.general.checkForUpdates = [ true ];
      setPreferences(preferences);
      ipcRenderer.send('check-for-update');
    }, 10);
  });

  const noAction = updateService.checkForUpdatesElement.querySelector('.dismiss-action');
  noAction.addEventListener('click', function () {
    const preferences = getPreferences();
    preferences.general.checkForUpdates = [];
    setPreferences(preferences);
    hideNotificationElements();
  });

  if (!updateService.updateErrorElement) { return; }
  const updateManuallyAction = updateService.updateErrorElement.querySelector('.primary-button');
  updateManuallyAction.addEventListener('click', function () {
    shell.openExternal('https://github.com/bep713/madden-franchise-editor/releases');
    hideNotificationElements();
  });

  const errorDismissAction = updateService.updateErrorElement.querySelector('.dismiss-action');
  errorDismissAction.addEventListener('click', function () {
    hideNotificationElements();
  });
};

function setPreferences(preferences) {
  ipcRenderer.sendSync('setPreferences', preferences);
};

function getPreferences() {
  return ipcRenderer.sendSync('getPreferences');
};

function hideNotificationElements() {
  document.querySelectorAll('.notification-wrapper').forEach((element) => {
    hideNotificationElement(element);
  });
};

function hideNotificationElement(element) {
  if (!element) { return; }
  element.classList.add(WRAPPER_HIDDEN_CLASS);

  setTimeout(() => {
    element.classList.add(HIDDEN_CLASS);
  }, 300);
};