const { ipcRenderer } = require('electron');
const HIDDEN_CLASS = 'hidden';
const BASE_CLASS = 'reload-wrapper';
const WRAPPER_HIDDEN_CLASS = 'reload-wrapper--hidden';

let reloadFileService = {};
addIpcListeners();

reloadFileService.initialize = () => {
  const reloadWrapper = document.querySelector(`.${BASE_CLASS}`);
  reloadFileService.reloadWrapper = reloadWrapper;
  reloadWrapper.classList.add(HIDDEN_CLASS);
  reloadWrapper.classList.add(WRAPPER_HIDDEN_CLASS);
  addEventListeners();
};

reloadFileService.hide = () => {
  hideReloadWrapper();
};

module.exports = reloadFileService;

function addIpcListeners() {
  ipcRenderer.on('file-changed', function () {
    if (!reloadFileService.reloadWrapper) { return }
    reloadFileService.reloadWrapper.classList.remove(HIDDEN_CLASS);

    setTimeout(() => {
      reloadFileService.reloadWrapper.classList.remove(WRAPPER_HIDDEN_CLASS);
    }, 20);
  });
};

function addEventListeners() {
  if (!reloadFileService.reloadWrapper) { return; }
  
  const primaryAction = reloadFileService.reloadWrapper.querySelector('.primary-button');
  primaryAction.addEventListener('click', function () {
    ipcRenderer.send('reload-file');
    hideReloadWrapper();
  });

  const secondaryAction = reloadFileService.reloadWrapper.querySelector('.action-button');
  secondaryAction.addEventListener('click', function () {
    hideReloadWrapper();
  });
};

function hideReloadWrapper() {
  if (!reloadFileService.reloadWrapper) { return; }
  reloadFileService.reloadWrapper.classList.add(WRAPPER_HIDDEN_CLASS);

  setTimeout(() => {
    reloadFileService.reloadWrapper.classList.add(HIDDEN_CLASS);
  }, 300);
};