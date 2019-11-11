const { ipcRenderer, remote, shell } = require('electron');
const dialog = remote.dialog;
const app = remote.app;

const utilService = require('./js/services/utilService');
const savedSchemaService = require('./js/services/savedSchemaService');

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
};

function setupSchemaService () {
  savedSchemaService.initialize();
};

function parseAvailableSchemas() {
  const schemas = savedSchemaService.getSavedSchemas();
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

    list.appendChild(listItem);
  });
};

function showSchemaLoadedNotification() {
  utilService.showNotificationElement('.schema-loaded', 3500);
};

function showSchemaErrorNotification() {
  utilService.showNotificationElement('.schema-error', 3500);
};