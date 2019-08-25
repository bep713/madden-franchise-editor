const { ipcRenderer, remote } = require('electron');
const app = remote.app;
const dialog = remote.dialog;

const moment = require('moment');
const EventEmitter = require('events').EventEmitter;

// const PATH_TO_DOCUMENTS = app.getPath('documents');
// const MADDEN_SAVE_BASE_FOLDER = `${PATH_TO_DOCUMENTS}\\Madden NFL 20\\settings`;

const utilService = require('./utilService');
const recentFileService = require('./recentFileService');

let welcomeService = {};
welcomeService.name = 'welcomeService';
welcomeService.eventEmitter = new EventEmitter();

addLoadedFileListener();

welcomeService.start = function (file) {
  addVersionNumber();
  addListeners();
  addRecentFiles();

  if (file.gameYear) {
    showOpenedFileLinks();
    toggleNavigationLinks(file.gameYear);
    toggleMaddenIcons(file.gameYear);
  }
};

welcomeService.onClose = function () {
  ipcRenderer.removeListener('file-loaded', onFileLoaded);
};

module.exports = welcomeService;

function addVersionNumber() {
  const version = document.querySelector('.version');
  version.innerHTML = `v${app.getVersion()} BETA`;
};

function addListeners() {
  addOpenFileListener();
  addOpenScheduleListener();
  addOpenTableEditorListener();
  addOpenSchemaViewerListener();
  addOpenAbilityEditorListener();
};

function addOpenFileListener() {
  const openFileButton = document.querySelector('#open-file');
  const openDifferentFileButton = document.querySelector('#open-different-file');

  openFileButton.addEventListener('click', openFile);
  openDifferentFileButton.addEventListener('click', openFile);
};

function addLoadedFileListener() {
  ipcRenderer.on('file-loaded', onFileLoaded);
};

function onFileLoaded (event, file) {
  toggleNavigationLinks(file.gameYear);
  toggleMaddenIcons(file.gameYear);
};

function toggleNavigationLinks(gameYear) {
  const abilityLink = document.querySelector('#open-ability-editor');

  if (abilityLink) {
    if (gameYear === 19) {
      abilityLink.classList.add('unavailable');
    }
    else {
      abilityLink.classList.remove('unavailable');
    }
  }
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

function addOpenAbilityEditorListener() {
  const openAbilityEditor = document.querySelector('#open-ability-editor');
  openAbilityEditor.addEventListener('click', function () {
    welcomeService.eventEmitter.emit('open-ability-editor');
  });
};

function addRecentFiles() {
  recentFileService.initialize();
  const recentFiles = recentFileService.getRecentFiles();

  const recentFilesList = document.querySelector('.load-recent-file ul');
  const recentFilesPlaceholder = document.querySelector('#no-recent-files');

  if (recentFiles.length === 0) {
    utilService.show(recentFilesPlaceholder);
  }
  else {
    utilService.hide(recentFilesPlaceholder);

    recentFiles.forEach((file) => {
      const fileName = file.path.substring(file.path.lastIndexOf('\\') + 1);
      const remainderOfPath = file.path.substring(0, file.path.lastIndexOf('\\'));

      const filePathDiv = document.createElement('div');
      filePathDiv.classList.add('file-item');

      const fileNameSpan = document.createElement('span');
      fileNameSpan.classList.add('file-name', 'link-item');
      fileNameSpan.innerHTML = fileName;

      fileNameSpan.addEventListener('click', function () {
        openFileFromPath(file.path);
      });

      const filePathSpan = document.createElement('span');
      filePathSpan.classList.add('file-path');
      filePathSpan.innerHTML = `(${remainderOfPath})`;

      const fileAccessTime = document.createElement('span');
      fileAccessTime.classList.add('file-access-time');
      fileAccessTime.innerHTML = moment(file.time).format('MM/DD/YYYY hh:mm A');

      filePathDiv.appendChild(fileNameSpan);
      filePathDiv.appendChild(filePathSpan);
      filePathDiv.appendChild(fileAccessTime);

      const item = document.createElement('li');
      item.appendChild(filePathDiv);

      recentFilesList.appendChild(item);
    });
  }
};

function openFile () {
  const filePath = dialog.showOpenDialog(remote.getCurrentWindow(), {
    title: 'Select franchise file to open',
    defaultPath: ipcRenderer.sendSync('getPreferences').general.defaultDirectory,
    filters: [{
      name: 'Franchise file',
      extensions: ['*']
    }]
  });

  if (filePath) {
    openFileFromPath(filePath[0]);
  }
};

function openFileFromPath(filePath) {
  utilService.show(document.querySelector('.loader-wrapper'));

  setTimeout(() => {
    welcomeService.eventEmitter.emit('open-file', filePath);
    recentFileService.addFile(filePath);
    const editorToOpen = ipcRenderer.sendSync('getPreferences').general.defaultEditor;
    if (editorToOpen && editorToOpen !== 'open-home') {
      welcomeService.eventEmitter.emit(editorToOpen);
    }
    else {
      showOpenedFileLinks();
      setTimeout(() => {
        utilService.hide(document.querySelector('.loader-wrapper'));
      }, 50);
    }
  }, 50);
};

function showOpenedFileLinks() {
  const openFileButton = document.querySelector('#open-file');
  utilService.hide(openFileButton);

  const openDifferentFileButton = document.querySelector('#open-different-file');
  utilService.show(openDifferentFileButton);

  const fileActions = document.querySelector('.file-actions');
  utilService.show(fileActions);
};