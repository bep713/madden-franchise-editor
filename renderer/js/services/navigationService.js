const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');
const { app, dialog, getCurrentWindow } = require('@electron/remote');

const Tab = require('./tabs/Tab');
const TableEditorTab = require('./tabs/TableEditorTab');

const FranchiseFile = require('madden-franchise');
const Selectr = require('../libs/selectr/selectr');
const TestUtility = require('./test-utils/TestUtility');

const utilService = require('./utilService');
const menuService = require('./menuService.js');
const updateService = require('./updateService');
const welcomeService = require('./welcomeService');
const scheduleService = require('./scheduleService');
const reloadFileService = require('./reloadFileService');
const savedSchemaService = require('./savedSchemaService');
const schemaViewerService = require('./schemaViewerService');
const abilityEditorService = require('./abilityEditorService');
const schemaMismatchService = require('./schemaMismatchService');

const TableEditorWrapper = require('./table-editor/TableEditorWrapper');
const tableEditorWrapper = new TableEditorWrapper();

const services = [welcomeService, scheduleService, tableEditorWrapper, schemaViewerService, abilityEditorService];
const navigationData = require('../../../data/navigation.json');

const PATH_TO_DOCUMENTS = app.getPath('documents');
const MADDEN_SAVE_BASE_FOLDER = {
  20: `${PATH_TO_DOCUMENTS}\\Madden NFL 20\\settings`,
  21: `${PATH_TO_DOCUMENTS}\\Madden NFL 21\\saves`,
  22: `${PATH_TO_DOCUMENTS}\\Madden NFL 22\\saves`
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
navigationService.tabs = [];
navigationService.lastWindowSize = {
  height: window.innerHeight,
  width: window.innerWidth
};

navigationService.generateMainNavigationTabs = function () {
  navigationService.tabs = [];

  const applicableNavigationData = navigationData.items.filter((navigation) => {
    return (navigation.availableVersions.includes(navigationService.currentlyOpenedFile.data._gameYear)
      && navigation.availableFormats.includes(navigationService.currentlyOpenedFile.data.type.format));
  });

  applicableNavigationData.forEach((item) => {
    let tab = new Tab();
    tab.name = item.text;
    tab.customClassList = item.classList;
    tab.clickListenerFunction = item.clickListener;
    
    tab.isActive = false;
    tab.isClosable = false;
    tab.isMainNavigationItem = true;

    navigationService.tabs.push(tab);
  });

  // append new tab button
  let newTabButton = new Tab();
  newTabButton.name = '+';
  newTabButton.customClassList = ['add-tab-button'];
  newTabButton.isAddTabButton = true;
  newTabButton.clickListenerFunction = 'onNewTabButtonClicked';
  newTabButton.isClosable = false;

  navigationService.tabs.push(newTabButton);
};

navigationService.addTab = function (name, clickListener) {
  let tab = new TableEditorTab();
  tab.name = name;
  tab.isClosable = true;
  tab.isMainNavigationItem = false;
  tab.clickListenerFunction = clickListener;

  navigationService.tabs.splice(navigationService.tabs.length - 1, 0, tab);
  return tab;
};

navigationService.getTabByName = function (name) {
  return navigationService.tabs.find((tab) => { return tab.name === name; });
};

navigationService.getActiveTab = function () {
  return navigationService.tabs.find((tab) => { return tab.isActive; });
};

navigationService.closeTab = function (tabToClose) {
  const tabIndexToDelete = navigationService.tabs.findIndex((tab) => { return tab === tabToClose; });
  navigationService.tabs.splice(tabIndexToDelete, 1);
};

navigationService.closeTabAndSelectNextAvailableIfNeeded = function (tabToClose) {
  const activeTab = navigationService.getActiveTab();
  const currentTabIndex = navigationService.tabs.findIndex((tab) => { return tab === tabToClose; });
  navigationService.closeTab(tabToClose);

  if (activeTab === tabToClose) {
    // if the user closed the active tab, select the next tab to the left.
    // otherwise, stay on the active tab.
    let nextTabToTheLeft = navigationService.tabs[currentTabIndex - 1];
  
    if (nextTabToTheLeft) {
      nextTabToTheLeft.isActive = true;
      navigationService[nextTabToTheLeft.clickListenerFunction]();
    }
  }
};

navigationService.selectTab = function (name) {
  let previouslyActiveTab = navigationService.getActiveTab();

  if (previouslyActiveTab) {
    previouslyActiveTab.isActive = false;
  }

  let tab = navigationService.tabs.find((tab) => { return tab.name === name; });

  if (tab) {
    tab.isActive = true;
  }
};

navigationService.scrollToTab = function (tabNode, options) {
  if (tabNode) {
    tabNode.scrollIntoViewIfNeeded(options);
  }
};

navigationService.scrollToActiveTab = function () {
  let targetNode = document.querySelector('.tab.active');
  const nextTabNode = document.querySelector('.tab.active + .tab');

  if (nextTabNode.classList.contains('add-tab-button')) {
    // always keep the '+' button in view if user has last tab active
    targetNode = nextTabNode;
  }

  navigationService.scrollToTab(targetNode, { inline: 'start' });
};

navigationService.scrollToTabOnRightOfActiveTab = function () {
  const targetTabDom = document.querySelector('.tab.active + .tab');
  navigationService.scrollToTab(targetTabDom, { inline: 'end' });
};

navigationService.generateNavigation = function () {
  const element = document.querySelector('.tab-wrapper');
  const rightActionButtons = document.querySelector('.right-action-buttons');

  element.innerHTML = '';

  navigationService.tabs.forEach((tab) => {
    let navWrapper = document.createElement('div');
    navWrapper.innerHTML = tab.name;
    navWrapper.classList.add('tab');

    if (tab.customClassList.length > 0) {
      navWrapper.classList.add(tab.customClassList);
    }

    if (tab.isClosable) {
      navWrapper.classList.add('closable');

      let closeTabButton = document.createElement('div');
      closeTabButton.classList.add('close-tab-button');

      closeTabButton.addEventListener('click', onCloseTab);
      navWrapper.addEventListener('auxclick', (event) => {
        if (event.button === 1) {
          onCloseTab(event);
        }
      });
      navWrapper.addEventListener('mousedown', (event) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      });

      navWrapper.appendChild(closeTabButton);
    }

    if (tab.isActive) {
      navWrapper.classList.add('active');
    } else {
      navWrapper.addEventListener('click', () => {
        let previouslyActiveTab = navigationService.getActiveTab();

        if (previouslyActiveTab) {
          previouslyActiveTab.isActive = false;
        }

        tab.isActive = true;
        navigationService[tab.clickListenerFunction]();
      });
    }

    element.appendChild(navWrapper);

    function onCloseTab(event) {
      event.stopPropagation();
      navigationService.closeTabAndSelectNextAvailableIfNeeded(tab);
      navigationService.generateNavigation();
    };
  });

  navigationService.scrollToActiveTab();

  // if (navigationService.currentlyOpenedFile) {
  //   const gameIcon = document.createElement('div');
  //   gameIcon.id = `m${navigationService.currentlyOpenedFile.gameYear}-icon`;
  //   gameIcon.className = 'madden-icon'

  //   rightActionButtons.appendChild(gameIcon);
  // }
};

navigationService.onNewTabButtonClicked = function () {
  let newTabButton = navigationService.getActiveTab();

  if (newTabButton) {
    newTabButton.isActive = false;
  }

  let newTab = navigationService.addTab('New Tab', 'onNewTabClicked');
  newTab.isActive = true;

  navigationService.onNewTabClicked();
};

navigationService.onNewTabClicked = function () {
  const activeTab = navigationService.getActiveTab();

  if (activeTab.tableId >= 0) {
    tableEditorWrapper.initialTableToSelect = {
      tableId: activeTab.tableId,
      recordIndex: activeTab.tableRow
    };
  }

  navigationService.onTableEditorClicked();
};

navigationService.onHomeClicked = function () {
  onNavigate(welcomeService);
  navigationService.loadPage('welcome.html');
  postGenerateNavigation();

  welcomeService.start(navigationService.currentlyOpenedFile);
};

navigationService.onScheduleEditorClicked = function () {
  navigationService.selectTab('Schedule');
  onNavigate(scheduleService);
  navigationService.loadPage('schedule.html');
  appendNavigation();
  postGenerateNavigation();

  scheduleService.loadSchedule(navigationService.currentlyOpenedFile.data);
};

navigationService.onTableEditorClicked = function () {
  // custom logic to find the table editor tab
  let placeholderTab = navigationService.tabs.find((tab) => { return tab.name === 'Open Table...'});
  if (placeholderTab) {
    // The first call to this function will remove the placeholder tab
    // and replace with a table editor tab.
    navigationService.closeTab(placeholderTab);
    let newTab = navigationService.addTab('New Tab', 'onNewTabClicked');
    newTab.isActive = true;
  }
  else {
    // check if a table editor tab is active
    let activeTab = navigationService.getActiveTab();
    
    if (!(activeTab instanceof TableEditorTab)) {
      let firstTableEditorTab = navigationService.tabs.find((tab) => { return tab instanceof TableEditorTab; });

      if (firstTableEditorTab) {
        activeTab.isActive = false;
        firstTableEditorTab.isActive = true;
        return navigationService.onNewTabClicked();
      } 
      else {
        // there are no open table editor tabs
        let newTab = navigationService.addTab('New Tab', 'onNewTabClicked');
        newTab.isActive = true;
        activeTab.isActive = false;
      }
    }
  }

  onNavigate(tableEditorWrapper);
  navigationService.loadPage('table-editor.html');
  appendNavigation();
  postGenerateNavigation();

  tableEditorWrapper.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onSchemaViewerClicked = function () {
  navigationService.selectTab('Schemas');
  onNavigate(schemaViewerService);
  navigationService.loadPage('schema-viewer.html');
  appendNavigation();
  postGenerateNavigation();

  schemaViewerService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onAbilityEditorClicked = function () {
  navigationService.selectTab('Abilities');
  onNavigate(abilityEditorService);
  navigationService.loadPage('ability-editor.html');
  appendNavigation();
  postGenerateNavigation();

  abilityEditorService.start(navigationService.currentlyOpenedFile.data);
};

navigationService.onLeagueEditorClicked = function () {
  navigationService.selectTab(leagueEditorService.name);
  onNavigate(leagueEditorService);
  navigationService.loadPage('league-editor.html');
  appendNavigation();
  postGenerateNavigation();

  // leagueEditorService.start(navigationService.currentlyOpenedFile.data);
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

if (process.env.NODE_ENV === 'testing') {
  new TestUtility(welcomeService, tableEditorService);
}

module.exports = navigationService;

function DEV_openFile() {
  // welcomeService.eventEmitter.emit('open-file', MADDEN_SAVE_BASE_FOLDER + '\\CAREER-M03TEST_MOD');
  // welcomeService.eventEmitter.emit('open-file', MADDEN_SAVE_BASE_FOLDER[21] + '\\CAREER-SCHEDULETEST_Replace');
  welcomeService.eventEmitter.emit('open-file', `${MADDEN_SAVE_BASE_FOLDER[22]}\\CAREER-TEST`);
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

  ipcRenderer.on('save-file-sync', function () {
    navigationService.currentlyOpenedFile.data.save(null, {
      sync: true
    });
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
    const savePath = dialog.showSaveDialogSync(getCurrentWindow(), {
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
    
    // assume m22 if no game year is set
    if (!navigationService.currentlyOpenedFile.data._gameYear) {
      navigationService.currentlyOpenedFile.data._gameYear = 22;
    }

    if (!navigationService.currentlyOpenedFile.data.type.year) {
      navigationService.currentlyOpenedFile.data.type.year = 22;
    }

    navigationService.currentlyOpenedFile.gameYear = navigationService.currentlyOpenedFile.data._gameYear;
    navigationService.currentlyOpenedFile.type = navigationService.currentlyOpenedFile.data.type;

    tableEditorWrapper.initialTableToSelect = null; // reset table to select on new file
    navigationService.generateMainNavigationTabs();

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
    tableEditorWrapper.initialTableToSelect = {
      tableId: tableId,
      recordIndex: index
    };

    navigationService.runCloseFunction();

    let scheduleTab = navigationService.getTabByName('Schedule');
    scheduleTab.isActive = false;

    // check if placeholder tab exists
    const placeholderTab = navigationService.getTabByName('Open Table...');
    if (placeholderTab) {
      navigationService.onTableEditorClicked();
    }
    else {
      navigationService.onNewTabButtonClicked();
    }
  });

  schemaViewerService.eventEmitter.on('change-schema', function () {
    showSchemaManager();
  });

  tableEditorWrapper.eventEmitter.on('table-changed', (data) => {
    let tab = navigationService.getActiveTab();
    tab.name = `${data.tableId} - ${data.name}`;
    tab.tableId = data.tableId;

    navigationService.generateNavigation();
  });

  tableEditorWrapper.eventEmitter.on('table-editor:new-tab', (tableId, row) => {
    navigationService.onNewTabButtonClicked();
  });

  window.addEventListener('resize', () => {
    let isGrowing = false;

    if (window.innerWidth > navigationService.lastWindowSize.width) {
      isGrowing = true;
    }

    navigationService.lastWindowSize = {
      height: window.innerHeight,
      width: window.innerWidth
    };

    let tabWrapper = document.querySelector('.tab-wrapper');

    if (tabWrapper && !tabWrapper.classList.contains('show-scrollbar')) {
      tabWrapper.classList.add('show-scrollbar');
      
      setTimeout(() => {
        tabWrapper.classList.remove('show-scrollbar');
      }, 400);
    }

    if (isGrowing) {
      navigationService.scrollToTabOnRightOfActiveTab();
    }
    else {
      navigationService.scrollToActiveTab();
    }
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
    dialog.showMessageBoxSync(getCurrentWindow(), {
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

function appendNavigation() {
  navigationService.generateNavigation();
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