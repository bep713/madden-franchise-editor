const fs = require('fs');

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

addGlobalIpcListeners();

welcomeService.start = function (file) {
  addTemporaryIpcListeners();
  addVersionNumber();
  addListeners();
  addRecentFiles();
  hideOpenedFileLinks();

  if (file.type) {
    showOpenedFileLinks();
    toggleNavigationLinks(file.type);
    toggleMaddenIcons(file.type.year);
  }
};

welcomeService.addRecentFile = (filePath) => {
  recentFileService.addFile(filePath);
  refreshRecentFilesList();
};

welcomeService.onClose = function () {
  ipcRenderer.removeListener('file-loaded', onFileLoaded);
  ipcRenderer.removeListener('close-file', onFileClosed);
};

module.exports = welcomeService;

function addVersionNumber() {
  const version = document.querySelector('.version');
  version.innerHTML = `v${app.getVersion()}`;
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

function addGlobalIpcListeners() {
  ipcRenderer.on('reload-file', (event, filePath) => {
    openFileFromPath(filePath);
  });

  ipcRenderer.on('message', function (event, message) {
    console.log(message);
  });
};

function addTemporaryIpcListeners() {
  ipcRenderer.on('file-loaded', onFileLoaded);
  ipcRenderer.on('close-file', onFileClosed);
};

function onFileLoaded (event, file) {
  toggleNavigationLinks(file.type);
  toggleMaddenIcons(file.type.year);
};

function onFileClosed (event) {
  hideOpenedFileLinks();
};

function toggleNavigationLinks(type) {
  const scheduleLink = document.querySelector('#open-schedule');
  const abilityLink = document.querySelector('#open-ability-editor');

  if (type.format === 'franchise-common') {
    abilityLink.classList.add('unavailable');
    scheduleLink.classList.add('unavailable');
  }

  else if (type.year === 19) {
    abilityLink.classList.add('unavailable');
    scheduleLink.classList.remove('unavailable');
  }

  else if (type.year === 21) {
    abilityLink.classList.add('unavailable');
  }

  else {
    abilityLink.classList.remove('unavailable');
    scheduleLink.classList.remove('unavailable');
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
  refreshRecentFilesList();
};

function refreshRecentFilesList() {
  const recentFiles = recentFileService.getRecentFiles();
  const recentFilesList = document.querySelector('.load-recent-file ul');
  const recentFilesPlaceholder = document.querySelector('#no-recent-files');

  if (recentFiles.length === 0) {
    utilService.show(recentFilesPlaceholder);
  }
  else {
    utilService.hide(recentFilesPlaceholder);
    
    document.querySelectorAll('.load-recent-file ul li:not(#no-recent-files').forEach((item) => {
      item.parentNode.removeChild(item);
    });

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
  const filePath = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
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
  if (fs.existsSync(filePath)) {
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
  } else {
    dialog.showErrorBox('File not found', 'Could not find the selected file. You may have renamed or deleted it.');
    recentFileService.removeFile(filePath);
    refreshRecentFilesList();
  }
};

function showOpenedFileLinks() {
  const openFileButton = document.querySelector('#open-file');
  if (openFileButton) {
    utilService.hide(openFileButton);
  }

  const openDifferentFileButton = document.querySelector('#open-different-file');
  if (openDifferentFileButton) {
    utilService.show(openDifferentFileButton);
  }

  const fileActions = document.querySelector('.file-actions');
  if (fileActions) {
    utilService.show(fileActions);
  }
};

function hideOpenedFileLinks() {
  const openFileButton = document.querySelector('#open-file');
  utilService.show(openFileButton);

  const openDifferentFileButton = document.querySelector('#open-different-file');
  utilService.hide(openDifferentFileButton);

  const fileActions = document.querySelector('.file-actions');
  utilService.hide(fileActions);
};