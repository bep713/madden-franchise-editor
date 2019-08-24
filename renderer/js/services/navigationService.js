const fs = require('fs');
const path = require('path');
const { ipcRenderer, remote } = require('electron');

const app = remote.app;

const FranchiseFile = require('madden-franchise');

const menuService = require('./menuService.js');
const welcomeService = require('./welcomeService');
const scheduleService = require('./scheduleService');
const tableEditorService = require('./tableEditorService');
const schemaViewerService = require('./schemaViewerService');
const abilityEditorService = require('./abilityEditorService');

const services = [welcomeService, scheduleService, tableEditorService, schemaViewerService, abilityEditorService];
const navigationData = require('../../../data/navigation.json');

const PATH_TO_DOCUMENTS = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = `${PATH_TO_DOCUMENTS}\\Madden NFL 20\\settings`;

setupEvents();
setupMenu();
attachServicesToNavigationData();
addIpcListeners();

let navigationService = {};
navigationService.currentlyOpenedFile = {
  path: null,
  data: null,
  gameYear: null
};

navigationService.currentlyOpenService = null;

navigationService.generateNavigation = function (activeItem) {
  const element = document.querySelector('.navigation');
  const rightActionButtons = document.querySelector('.right-action-buttons');

  const applicableNavigationData = navigationData.items.filter((navigation) => {
    return navigation.availableVersions.includes(navigationService.currentlyOpenedFile.data._gameYear);
  });

  applicableNavigationData.forEach((item) => {
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

  if (navigationService.currentlyOpenedFile) {
    const gameIcon = document.createElement('div');
    gameIcon.id = `m${navigationService.currentlyOpenedFile.gameYear}-icon`;
    gameIcon.className = 'madden-icon'

    rightActionButtons.appendChild(gameIcon);
  }
};

navigationService.onHomeClicked = function () {
  onNavigate(welcomeService);
  navigationService.loadPage('welcome.html');

  welcomeService.start(navigationService.currentlyOpenedFile);
};

navigationService.onScheduleEditorClicked = function () {
  onNavigate(scheduleService);
  navigationService.loadPage('schedule.html');
  appendNavigation('schedule-editor');

  scheduleService.loadSchedule(navigationService.currentlyOpenedFile.data);
};

navigationService.onTableEditorClicked = function () {
  onNavigate(tableEditorService);
  navigationService.loadPage('table-editor.html');
  appendNavigation('table-editor');

  tableEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onSchemaViewerClicked = function () {
  onNavigate(schemaViewerService);
  navigationService.loadPage('schema-viewer.html');
  appendNavigation('schema-viewer');

  schemaViewerService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onAbilityEditorClicked = function () {
  onNavigate(abilityEditorService);
  navigationService.loadPage('ability-editor.html');
  appendNavigation('ability-editor');

  abilityEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.loadPage = function (pagePath) {
  const page = fs.readFileSync(path.join(__dirname, '..\\..\\', pagePath));
  const content = document.querySelector('#content');
  content.innerHTML = page;
};

navigationService.runCloseFunction = function () {

  if (navigationService.currentlyOpenService && navigationService.currentlyOpenService.onClose) {
    navigationService.currentlyOpenService.onClose();
  }
};

DEV_openFile();

module.exports = navigationService;

function DEV_openFile() {
  // welcomeService.eventEmitter.emit('open-file', MADDEN_SAVE_BASE_FOLDER + '\\CAREER-2019');
  // welcomeService.eventEmitter.emit('open-file', 'D:\\Projects\\Madden 20\\CAREER-BEPFRANCHISE');
  welcomeService.eventEmitter.emit('open-file', `${MADDEN_SAVE_BASE_FOLDER}\\CAREER-AUG21-05h46m36pm`);

  setTimeout(() => {
    navigationService.onAbilityEditorClicked();
  }, 0);
};

function onNavigate(service) {
  navigationService.runCloseFunction();
  navigationService.currentlyOpenService = service;

  if (service.navigationData.menu) {
    menuService.enableMenuIds(service.navigationData.menu.enable);
    menuService.disableMenuIds(service.navigationData.menu.disable);
  }
};

function addIpcListeners() {
  ipcRenderer.on('save-file', function () {
    navigationService.currentlyOpenedFile.data.save();
  });

  ipcRenderer.on('close-file', function () {
    navigationService.currentlyOpenedFile.path = null;
    navigationService.currentlyOpenedFile.data = null;
    navigationService.currentlyOpenedFile.gameYear = null;
    navigationService.onHomeClicked();

    ipcRenderer.send('close-file');
  });
};

function setupEvents() {
  welcomeService.eventEmitter.on('open-file', function (file) {
    navigationService.currentlyOpenedFile.path = file;
    navigationService.currentlyOpenedFile.data = new FranchiseFile(file);
    navigationService.currentlyOpenedFile.gameYear = navigationService.currentlyOpenedFile.data._gameYear;

    ipcRenderer.send('file-loaded', {
      'path': navigationService.currentlyOpenedFile.path,
      'gameYear': navigationService.currentlyOpenedFile.gameYear
    });

    backupFile(navigationService.currentlyOpenedFile);

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

  welcomeService.eventEmitter.on('open-ability-editor', function () {
    navigationService.onAbilityEditorClicked();
  });

  scheduleService.eventEmitter.on('open-table-editor', function (tableId, index) {
    tableEditorService.initialTableToSelect = {
      tableId: tableId,
      recordIndex: index
    };

    navigationService.runCloseFunction();
    navigationService.onTableEditorClicked();
  });
};

function setupMenu() {
  menuService.initializeMenu();  
};

function attachServicesToNavigationData() {
  services.forEach((service) => {
    service.navigationData = navigationData.items.find((nav) => { return nav.service === service.name; });
  });
};

function appendNavigation(activeItemId) {
  const activeItem = navigationData.items.find((item) => { return item.id === activeItemId; });
  navigationService.generateNavigation(activeItem);
};

function backupFile(franchiseFile) {
  if (!fs.existsSync('temp/backup')) {
    if (!fs.existsSync('temp')) {
      fs.mkdirSync('temp');
    }
    
    fs.mkdirSync('temp/backup');
  }

  fs.writeFile('temp/backup/backup.bak', franchiseFile.data.rawContents, function (err) {
    if (err) {
      throw err;
    }
  });
};