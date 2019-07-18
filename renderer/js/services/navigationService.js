const fs = require('fs');
const path = require('path');
const { ipcRenderer, remote } = require('electron');

const app = remote.app;

const FranchiseFile = require('../franchise/FranchiseFile');

const menuService = require('./menuService.js');
const welcomeService = require('./welcomeService');
const scheduleService = require('./scheduleService');
const tableEditorService = require('./tableEditorService');
const schemaViewerService = require('./schemaViewerService');
const navigationData = require('../../../data/navigation.json');

const PATH_TO_DOCUMENTS = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = `${PATH_TO_DOCUMENTS}\\Madden NFL 19\\settings`;

setupEvents();
setupMenu();
addIpcListeners();

let navigationService = {};
navigationService.currentlyOpenedFile = {
  path: null,
  data: null
};

navigationService.generateNavigation = function (element, activeItem) {
  navigationData.items.forEach((item) => {
    const button = document.createElement('div');
    button.innerHTML = item.text;
    button.classList.add('nav-item', 'action-button');

    if (item === activeItem) {
      button.classList.add('active');
    } else {
      button.addEventListener('click', navigationService[item.clickListener]);
    }

    element.appendChild(button);
  });
};

navigationService.onHomeClicked = function () {
  navigationService.loadPage('welcome.html');
  welcomeService.start(navigationService.currentlyOpenedFile.path);
};

navigationService.onScheduleEditorClicked = function () {
  navigationService.loadPage('schedule.html');
  appendNavigation('schedule-editor');

  scheduleService.loadSchedule(navigationService.currentlyOpenedFile.data);
};

navigationService.onTableEditorClicked = function () {
  navigationService.loadPage('table-editor.html');
  appendNavigation('table-editor');

  tableEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onSchemaViewerClicked = function () {
  navigationService.loadPage('schema-viewer.html');
  appendNavigation('schema-viewer');

  schemaViewerService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.loadPage = function (pagePath) {
  const page = fs.readFileSync(path.join(__dirname, '..\\..\\', pagePath));
  const content = document.querySelector('#content');
  content.innerHTML = page;
};

DEV_openFile();

module.exports = navigationService;

function DEV_openFile() {
  welcomeService.eventEmitter.emit('open-file', MADDEN_SAVE_BASE_FOLDER + '\\CAREER-2019');

  setTimeout(() => {
    navigationService.onTableEditorClicked();
  }, 10);
};

function addIpcListeners() {
  ipcRenderer.on('close-file', function () {
    navigationService.currentlyOpenedFile.path = null;
    navigationService.currentlyOpenedFile.data = null;
    navigationService.onHomeClicked();

    ipcRenderer.send('close-file');
  });
};

function setupEvents() {
  welcomeService.eventEmitter.on('open-file', function (file) {
    navigationService.currentlyOpenedFile.path = file;
    navigationService.currentlyOpenedFile.data = new FranchiseFile(file);
    ipcRenderer.send('load-file', file);
    backupFile(navigationService.currentlyOpenedFile.path);

    navigationService.currentlyOpenedFile.data.on('saving', function () {
      ipcRenderer.send('saving');
    });
  
    navigationService.currentlyOpenedFile.data.on('saved', function (game) {
      ipcRenderer.send('saved');
    });

    navigationService.currentlyOpenedFile.data.on('tables-done', function () {
      // const file = navigationService.currentlyOpenedFile.data;
      // tableEditorService.onFileReady(file);
      // schemaViewerService.onFileReady(file);
    });
  });

  welcomeService.eventEmitter.on('open-schedule', function () {
    navigationService.onScheduleEditorClicked();
  });
  
  welcomeService.eventEmitter.on('open-table-editor', function () {
    navigationService.onTableEditorClicked();
  });

  welcomeService.eventEmitter.on('open-schema-viewer', function () {
    navigationService.onSchemaViewerClicked();
  });
};

function setupMenu() {
  menuService.initializeMenu();  
};

function appendNavigation(activeItemId) {
  const navigation = document.querySelector('.navigation');
  const activeItem = navigationData.items.find((item) => { return item.id === activeItemId; });
  navigationService.generateNavigation(navigation, activeItem);
};

function backupFile(franchiseFile) {
  if (!fs.existsSync('temp/backup')) {
    if (!fs.existsSync('temp')) {
      fs.mkdirSync('temp');
    }
    
    fs.mkdirSync('temp/backup');
  }

  fs.writeFile('temp/backup/backup.bak', franchiseFile.rawContents, function (err) {
    if (err) {
      throw err;
    }
  });
};