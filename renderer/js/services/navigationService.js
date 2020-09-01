const fs = require('fs');
const path = require('path');
const { ipcRenderer, remote } = require('electron');

const app = remote.app;
const dialog = remote.dialog;

const Selectr = require('../libs/selectr/selectr');
const FranchiseFile = require('madden-franchise');

const utilService = require('./utilService');
const menuService = require('./menuService.js');
const updateService = require('./updateService');
const welcomeService = require('./welcomeService');
const scheduleService = require('./scheduleService');
const reloadFileService = require('./reloadFileService');
const savedSchemaService = require('./savedSchemaService');
const tableEditorService = require('./tableEditorService');
const leagueEditorService = require('./leagueEditorService');
const schemaViewerService = require('./schemaViewerService');
const abilityEditorService = require('./abilityEditorService');
const schemaMismatchService = require('./schemaMismatchService');

const services = [welcomeService, scheduleService, tableEditorService, schemaViewerService, abilityEditorService, leagueEditorService];
const navigationData = require('../../../data/navigation.json');

const PATH_TO_DOCUMENTS = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = {
  20: `${PATH_TO_DOCUMENTS}\\Madden NFL 20\\settings`,
  21: `${PATH_TO_DOCUMENTS}\\Madden NFL 21\\saves`
};

setupEvents();
setupMenu();
attachServicesToNavigationData();
addIpcListeners();

reloadFileService.initialize();
updateService.initialize();

conditionallyShowCheckForUpdatesNotification();

let navigationService = {};
navigationService.currentlyOpenedFile = {
  path: null,
  data: null,
  gameYear: null,
  type: null
};

navigationService.currentlyOpenService = null;

navigationService.generateNavigation = function (activeItem) {
  const element = document.querySelector('.navigation');
  const rightActionButtons = document.querySelector('.right-action-buttons');

  const applicableNavigationData = navigationData.items.filter((navigation) => {
    return (navigation.availableVersions.includes(navigationService.currentlyOpenedFile.data._gameYear)
      && navigation.availableFormats.includes(navigationService.currentlyOpenedFile.data.type.format));
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

  const selectionNavigation = document.createElement('select');
  element.appendChild(selectionNavigation);

  const selectrNavigation = new Selectr(selectionNavigation, {
    'data': applicableNavigationData.map((item) => {
      return {
        'value': item.clickListener,
        'text': item.text
      }
    })
  });

  selectrNavigation.setValue(activeItem.clickListener);

  selectrNavigation.on('selectr.change', (arg) => {
    navigationService[selectrNavigation.getValue(true).value]();
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
  postGenerateNavigation();

  welcomeService.start(navigationService.currentlyOpenedFile);
};

navigationService.onScheduleEditorClicked = function () {
  onNavigate(scheduleService);
  navigationService.loadPage('schedule.html');
  appendNavigation('schedule-editor');
  postGenerateNavigation();

  scheduleService.loadSchedule(navigationService.currentlyOpenedFile.data);
};

navigationService.onTableEditorClicked = function () {
  onNavigate(tableEditorService);
  navigationService.loadPage('table-editor.html');
  appendNavigation('table-editor');
  postGenerateNavigation();

  tableEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onSchemaViewerClicked = function () {
  onNavigate(schemaViewerService);
  navigationService.loadPage('schema-viewer.html');
  appendNavigation('schema-management');
  postGenerateNavigation();

  schemaViewerService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onAbilityEditorClicked = function () {
  onNavigate(abilityEditorService);
  navigationService.loadPage('ability-editor.html');
  appendNavigation('ability-editor');
  postGenerateNavigation();

  abilityEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onLeagueEditorClicked = function () {
  onNavigate(leagueEditorService);
  navigationService.loadPage('league-editor.html');
  appendNavigation('league-editor');
  postGenerateNavigation();

  leagueEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.refreshCurrentPage = function () {
  navigationService[navigationService.currentlyOpenService.navigationData.clickListener]();
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

if (process.env.NODE_ENV === 'development') {
  DEV_openFile(); 
}

module.exports = navigationService;

function DEV_openFile() {
  // welcomeService.eventEmitter.emit('open-file', MADDEN_SAVE_BASE_FOLDER + '\\CAREER-M03TEST_MOD');
  // welcomeService.eventEmitter.emit('open-file', MADDEN_SAVE_BASE_FOLDER[21] + '\\CAREER-SCHEDULETEST_Replace');
  welcomeService.eventEmitter.emit('open-file', 'C:\\tmp\\M21\\saves\\CAREER-LIONS2021');
  // welcomeService.eventEmitter.emit('open-file', 'D:\\Projects\\Madden 20\\CAREER-TESTNEW');
  // welcomeService.eventEmitter.emit('open-file', `D:\\Projects\\Madden 20\\FranchiseData\\Franchise-Tuning-binary.FTC`);

  setTimeout(() => {
    // ipcRenderer.send('show-preferences-window');
    navigationService.onTableEditorClicked();
    // navigationService.onScheduleEditorClicked();
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

function postGenerateNavigation() {
  
};

function addIpcListeners() {
  ipcRenderer.on('show-check-for-update-notification', function () {
    console.log('show checkf or update notification');
  });
  
  ipcRenderer.on('save-file', function () {
    navigationService.currentlyOpenedFile.data.save();
  });

  ipcRenderer.on('close-file', function () {
    navigationService.currentlyOpenedFile.path = null;
    navigationService.currentlyOpenedFile.data = null;
    navigationService.currentlyOpenedFile.gameYear = null;
    navigationService.currentlyOpenedFile.type = null;
    navigationService.onHomeClicked();

    ipcRenderer.send('close-file');
  });

  ipcRenderer.on('save-new-file', function () {
    const savePath = dialog.showSaveDialogSync(remote.getCurrentWindow(), {
      'title': 'Save as...',
      'defaultPath': ipcRenderer.sendSync('getPreferences').general.defaultDirectory
    });
    
    if (savePath) {
      navigationService.currentlyOpenedFile.data.filePath = savePath;
      ipcRenderer.send('file-loaded', {
        'path': savePath,
        'gameYear': navigationService.currentlyOpenedFile.data._gameYear
      });

      welcomeService.addRecentFile(savePath);
      navigationService.currentlyOpenedFile.data.save();
    }
  });

  ipcRenderer.on('load-schema', function (_, args) {
    if (!navigationService.currentlyOpenedFile.path) { return; }
    utilService.show(document.querySelector('.loader-wrapper'));
      
    setTimeout(() => {
      navigationService.currentlyOpenedFile.data = new FranchiseFile(navigationService.currentlyOpenedFile.path, {
        'schemaOverride': {
          'path': args.path
        }
      });

      navigationService.currentlyOpenedFile.data.on('error', (err) => {
        ipcRenderer.send('load-schema-done', {
          'status': 'error',
          'error': err
        });
      });

      navigationService.currentlyOpenedFile.data.on('ready', () => {
        navigationService.refreshCurrentPage();

        if (args.saveSchema) {
          savedSchemaService.saveSchema(args.path, {
            'gameYear': navigationService.currentlyOpenedFile.data.schemaList.meta.gameYear,
            'major': navigationService.currentlyOpenedFile.data.schemaList.meta.major,
            'minor': navigationService.currentlyOpenedFile.data.schemaList.meta.minor,
            'fileExtension': path.extname(navigationService.currentlyOpenedFile.data.schemaList.path)
          })
        }

        utilService.hide(document.querySelector('.loader-wrapper'));

        ipcRenderer.send('load-schema-done', {
          'status': 'successful'
        });
      });
    }, 10);
  });

  ipcRenderer.on('get-schema-info-request', function (event, arg) {
    if (navigationService.currentlyOpenedFile.data) {
      ipcRenderer.send('get-schema-info-response', {
        'expected': navigationService.currentlyOpenedFile.data.expectedSchemaVersion,
        'loaded': navigationService.currentlyOpenedFile.data.schemaList.meta,
        'autoSelect': arg
      });
    }
  });

  ipcRenderer.on('currently-searching-response', function (event, arg) {
    if (!arg) {
      schemaMismatchService.initialize(navigationService.currentlyOpenedFile.data);
      schemaMismatchService.eventEmitter.on('navigate', function () {
        navigationService.onSchemaViewerClicked();
      });
    }
  });
};

function setupEvents() {
  welcomeService.eventEmitter.on('open-file', function (file) {
    navigationService.currentlyOpenedFile.path = file;
    navigationService.currentlyOpenedFile.data = createNewFranchiseFile(file);
    navigationService.currentlyOpenedFile.gameYear = navigationService.currentlyOpenedFile.data._gameYear;
    navigationService.currentlyOpenedFile.type = navigationService.currentlyOpenedFile.data.type;

    ipcRenderer.send('file-loaded', {
      'path': navigationService.currentlyOpenedFile.path,
      'type': navigationService.currentlyOpenedFile.type
    });

    backupFile(navigationService.currentlyOpenedFile);

    ipcRenderer.send('is-currently-searching');

    schemaMismatchService.eventEmitter.on('schema-quick-search', function () {
      ipcRenderer.send('schema-quick-search');
    });

    navigationService.currentlyOpenedFile.data.on('saving', function () {
      ipcRenderer.send('saving');
      reloadFileService.hide();
    });
  
    navigationService.currentlyOpenedFile.data.on('saved', function (game) {
      ipcRenderer.send('saved');
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

  schemaViewerService.eventEmitter.on('change-schema', function () {
    showSchemaManager();
  });
};

function showSchemaManager() {
  ipcRenderer.send('show-schema-manager', {
    'expected': navigationService.currentlyOpenedFile.data.expectedSchemaVersion,
    'loaded': navigationService.currentlyOpenedFile.data.schemaList.meta
  });
}

function createNewFranchiseFile(file) {
  let newFile;

  newFile = new FranchiseFile(file, {
    'schemaDirectory': savedSchemaService.getSchemaPath()
  });

  newFile.once('error', pickSchema);
  newFile.on('ready', () => {
    newFile.off('error', pickSchema);
  });

  return newFile;

  function pickSchema() {
    remote.dialog.showMessageBoxSync(remote.getCurrentWindow(), {
      'message': 'The selected file does not contain schema data. Please select one on the following screen.'
    });
    
    showSchemaManager();
  };
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

function conditionallyShowCheckForUpdatesNotification() {
  const checkForUpdates = ipcRenderer.sendSync('getPreferences').general.checkForUpdates;
  if (checkForUpdates === undefined || checkForUpdates === null) {
    updateService.showCheckForUpdatesNotification();
  }
};