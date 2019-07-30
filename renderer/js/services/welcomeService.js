const { remote, ipcRenderer } = require('electron');
const app = remote.app;
const dialog = remote.dialog;

const EventEmitter = require('events').EventEmitter;

const PATH_TO_DOCUMENTS = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = `${PATH_TO_DOCUMENTS}\\Madden NFL 19\\settings`;

const utilService = require('./utilService');

let welcomeService = {};
welcomeService.eventEmitter = new EventEmitter();

addLoadedFileListener();

welcomeService.start = function (file) {
  addListeners();

  if (file.gameYear) {
    showOpenedFileLinks();
    toggleNavigationLinks(file.gameYear);
    toggleMaddenIcons(file.gameYear);
  }
};

module.exports = welcomeService;

function addListeners() {
  addOpenFileListener();
  addOpenScheduleListener();
  addOpenTableEditorListener();
  addOpenSchemaViewerListener();
};

function addOpenFileListener() {
  const openFileButton = document.querySelector('#open-file');
  const openDifferentFileButton = document.querySelector('#open-different-file');

  openFileButton.addEventListener('click', openFile);
  openDifferentFileButton.addEventListener('click', openFile);
};

function addLoadedFileListener() {
  ipcRenderer.on('file-loaded', (event, file) => {
    toggleNavigationLinks(file.gameYear);
    toggleMaddenIcons(file.gameYear);
  });
};

function toggleNavigationLinks(gameYear) {
  // const scheduleLink = document.querySelector('#open-schedule');

  // if (scheduleLink) {
  //   if (gameYear === 20) {
  //     scheduleLink.classList.add('unavailable');
  //   }
  //   else {
  //     scheduleLink.classList.remove('unavailable');
  //   }
  // }
};

function toggleMaddenIcons(year) {
  const iconsToDisable = document.querySelectorAll('.madden-icon:not([data-year="' + year + '"])');
  const iconToEnable = document.querySelector('.madden-icon[data-year="' + year + '"]');

  iconsToDisable.forEach((icon) => {
    icon.classList.add('inactive');
  });

  iconToEnable.classList.remove('inactive');
};

function addOpenScheduleListener() {
  const openScheduleButton = document.querySelector('#open-schedule');
  openScheduleButton.addEventListener('click', function () {
    welcomeService.eventEmitter.emit('open-schedule');
  });
};

function addOpenTableEditorListener() {
  const openTableEditor = document.querySelector('#open-table-editor');
  openTableEditor.addEventListener('click', function () {
    welcomeService.eventEmitter.emit('open-table-editor');
  });
};

function addOpenSchemaViewerListener() {
  const openTableEditor = document.querySelector('#open-schema-viewer');
  openTableEditor.addEventListener('click', function () {
    welcomeService.eventEmitter.emit('open-schema-viewer');
  });
};

function openFile () {
  const filePath = dialog.showOpenDialog({
    title: 'Select franchise file to open',
    defaultPath: MADDEN_SAVE_BASE_FOLDER,
    filters: [{
      name: 'Franchise file',
      extensions: ['*']
    }]
  });

  if (filePath) {
    utilService.show(document.querySelector('.loader-wrapper'));
    welcomeService.eventEmitter.emit('open-file', filePath[0]);
    showOpenedFileLinks();

    setTimeout(() => {
      utilService.hide(document.querySelector('.loader-wrapper'));
    }, 50);
  }
};

function showOpenedFileLinks() {
  const openFileButton = document.querySelector('#open-file');
  utilService.hide(openFileButton);

  const openDifferentFileButton = document.querySelector('#open-different-file');
  utilService.show(openDifferentFileButton);

  const fileActions = document.querySelector('.file-actions');
  utilService.show(fileActions);
};