const { ipcRenderer, remote, shell } = require('electron');
const dialog = remote.dialog;
const app = remote.app;

const fs = require('fs');
const path = require('path');
const utilService = require('./js/services/utilService');
const savedSchemaService = require('./js/services/savedSchemaService');
const schemaSearchService = require('./js/services/schemaSearchService');

let schemaInformation;

setupListeners();
setupIpcListeners();
setupSchemaService();
parseAvailableSchemas();

function setupListeners() {
  const addSchema = document.querySelector('#add-schema');
  addSchema.addEventListener('click', () => {
    const customSchemaFile = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      'title': 'Open custom schema file...',
      'defaultPath': ipcRenderer.sendSync('getPreferences').general.defaultDirectory,
      'filters': [{
        name: 'Franchise schema',
        extensions: ['gz', 'xml', 'ftx']
      }]
    });

    if (customSchemaFile) {
      utilService.show(document.querySelector('.loader-wrapper'));

      setTimeout(() => {
        ipcRenderer.send('load-schema', {
          'path': customSchemaFile[0],
          'saveSchema': true
        });
      }, 20);
    }
  });

  const searchSchemas = document.querySelector('#search-for-schemas-full');
  searchSchemas.addEventListener('click', () => {
    
    const maddenInstallDirectory = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      'title': 'Select Madden Executable',
      'defaultPath': ipcRenderer.sendSync('getPreferences').gameVersions.madden20Directory,
      'properties': ['openFile'],
      'filters': [{
        name: 'Game executable',
        extensions: ['exe']
      }]
    });
          
    if (maddenInstallDirectory) {
      utilService.show(document.querySelector('.loader-wrapper'));
      
      setTimeout(() => {
        console.time('search');
        getCompleteScanDirectories(maddenInstallDirectory[0]).then((dirs) => {
          saveSchemas(dirs);
        });
      }, 20);
    }
  });

  const searchSchemasQuick = document.querySelector('#search-for-schemas-quick');
  searchSchemasQuick.addEventListener('click', () => {
    
    const maddenInstallDirectory = dialog.showOpenDialogSync(remote.getCurrentWindow(), {
      'title': 'Select Madden Executable',
      'defaultPath': ipcRenderer.sendSync('getPreferences').gameVersions.madden20Directory,
      'properties': ['openFile'],
      'filters': [{
        name: 'Game executable',
        extensions: ['exe']
      }]
    });
          
    if (maddenInstallDirectory) {
      quickSchemaScan(maddenInstallDirectory[0]);
    }
  });

};

function saveSchemas(directoriesToSearch) {
  let filesDone = 0;
  let filesToSearch = 0;
  updateProgressMessage(0);

  schemaSearchService.search(directoriesToSearch)
    .then((schemas) => {
      let newSchemas = [];

      schemas.forEach((schema) => {
        if (!savedSchemaService.schemaExists(schema.meta)) {
          savedSchemaService.saveSchemaData(schema.data, schema.meta);
        }
      });
      
      parseAvailableSchemas(true);
      schemaSearchService.eventEmitter.off('file-done', updateLoadingMessage);
      console.timeEnd('search');
      utilService.hide(document.querySelector('.loader-wrapper'));
    });

  schemaSearchService.eventEmitter.on('directory-scan', (numFiles) => {
    filesToSearch += numFiles.fileCount;
    updateLoadingMessage();
    filesDone -= 1;
  });

  schemaSearchService.eventEmitter.on('file-done', updateLoadingMessage)

  function updateLoadingMessage (data) {
    filesDone += 1;
    const progress = (filesDone / filesToSearch) * 100;
    updateProgressMessage(progress);
  };
};

function quickSchemaScan(maddenInstallDirectory) {
  utilService.show(document.querySelector('.loader-wrapper'));

  setTimeout(() => {
    console.time('search');
    getQuickScanDirectories(maddenInstallDirectory).then((dirs) => {
      saveSchemas(dirs);
    });
  }, 20);
};

function updateProgressMessage(progress) {
  const progressElement = document.querySelector('.progress-message');
  progressElement.innerHTML = `${progress.toFixed(0)}%`;
};

function setupIpcListeners() {
  ipcRenderer.on('load-schema-done', function (_, arg) {
    utilService.hide(document.querySelector('.loader-wrapper'));

    if (arg.status === 'successful') {
      parseAvailableSchemas();
      showSchemaLoadedNotification();
    }
    else {
      showSchemaErrorNotification();
    }
  });

  ipcRenderer.on('get-schema-info-response', function (_, arg) {
    schemaInformation = arg;

    const loadedSchema = document.querySelector(`.schema-list-wrapper li[data-game-year="${schemaInformation.loaded.gameYear}"][data-major="${schemaInformation.loaded.major}"][data-minor="${schemaInformation.loaded.minor}"]`);
    const expectedSchema = document.querySelector(`.schema-list-wrapper li[data-game-year="${schemaInformation.expected.gameYear}"][data-major="${schemaInformation.expected.major}"][data-minor="${schemaInformation.expected.minor}"]`);

    if (loadedSchema) {
      loadedSchema.classList.add('loaded-schema');
    }

    if (expectedSchema) {
      expectedSchema.classList.add('expected-schema');

      if (loadedSchema && loadedSchema !== expectedSchema && arg.autoSelect) {
        expectedSchema.click();
      }
    }
  });

  ipcRenderer.on('schema-quick-scan', function (_, arg) {
    const settingToCheck = `madden${arg}Directory`;
    const directory = ipcRenderer.sendSync('getPreferences').gameVersions[settingToCheck];

    if (directory === null || directory === undefined || directory.length === 0) {
      return;
    }

    quickSchemaScan(directory + '/Madden20.exe');
  });
};

function setupSchemaService () {
  savedSchemaService.initialize();
};

function parseAvailableSchemas(autoSelect) {
  const schemas = savedSchemaService.getSavedSchemas();
  schemas.sort((a, b) => {
    if (a.gameYear !== b.gameYear) {
      return a.gameYear - b.gameYear;
    }
    else if (a.major !== b.major) {
      return a.major - b.major;
    }
    else {
      return a.minor - b.minor;
    }
  })
  const list = document.querySelector('.schema-list-wrapper');
  list.innerHTML = '';

  schemas.forEach((schema) => {
    const listItem = document.createElement('li');
    listItem.classList.add('schema-list-item');
    listItem.innerHTML = `M${schema.gameYear} ${schema.major}.${schema.minor}`;

    listItem.addEventListener('click', () => {
      utilService.show(document.querySelector('.loader-wrapper'));

      setTimeout(() => {
        ipcRenderer.send('load-schema', {
          'path': schema.path,
          'saveSchema': false
        });
      }, 20);
    });

    listItem.dataset.gameYear = schema.gameYear;
    listItem.dataset.major = schema.major;
    listItem.dataset.minor = schema.minor;

    list.appendChild(listItem);
  });

  ipcRenderer.send('get-schema-info-request', autoSelect);
};

function showSchemaLoadedNotification () {
  utilService.showNotificationElement('.schema-loaded', 3500);
};

function showSchemaErrorNotification () {
  utilService.showNotificationElement('.schema-error', 3500);
};

function isDev () {
  return process.env.NODE_ENV === 'development';
};

function getQuickScanDirectories(pathToExecutable) {
  // just patch - 00
  return new Promise((resolve, reject) => {
    resolve([path.join(pathToExecutable, '../patch/Win32/superbundlelayout/madden_installpackage_00')]);
  });
};

function getCompleteScanDirectories(pathToExecutable) {
  // all
  return new Promise((resolve, reject) => {
    const gameDirectory = path.join(pathToExecutable, '..');
    const dirsToSearch = ['Data', 'Patch'];
    let dataDirectoryPromises = [];
  
    dirsToSearch.forEach((dir) => {
      dataDirectoryPromises.push(searchForCasDirectories(gameDirectory, dir));
    });
  
    Promise.all(dataDirectoryPromises).then((dirs) => {
      resolve(dirs.flat());
    });
  });
};

function searchForCasDirectories(gameDirectory, dir) {
  return new Promise((resolve, reject) => {
    const patchDirectory = path.join(gameDirectory, dir);
    const patchBundle = path.join(patchDirectory, 'Win32/superbundlelayout');
  
    fs.readdir(patchBundle, function (err, folders) {
      resolve(folders.map((folder) => {
        return path.join(patchBundle, folder);
      }));
    });
  });
};