const { remote } = require('electron');
const app = remote.app;
const dialog = remote.dialog;

const EventEmitter = require('events').EventEmitter;

const PATH_TO_DOCUMENTS = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = `${PATH_TO_DOCUMENTS}\\Madden NFL 19\\settings`;

const utilService = require('./utilService');

let welcomeService = {};
welcomeService.eventEmitter = new EventEmitter();

welcomeService.start = function (file) {
  addListeners();

  if (file) {
    showOpenedFileLinks();
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
    welcomeService.eventEmitter.emit('open-file', filePath[0]);
    showOpenedFileLinks();
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