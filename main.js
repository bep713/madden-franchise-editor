const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const preferencesService = require('./renderer/js/services/preferencesService');

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow, workerWindow;
let workerReady = false;
let pendingWorkerEvents = [];
const isDev = process.env.NODE_ENV === 'development';

let fileDependentMenuItems = ['CloseFile', 'RevealInExplorer'];

if (isDev) {
  require('electron-reload')(__dirname, {
    ignored: /node_modules|[\/\\]\.|temp/,
    // electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
  });
}

const homePage = 'renderer/index.html';
const workerPage = 'renderer/worker.html';
const baseWindowTitle = 'Madden Franchise Editor';
let currentFilePath = '';

function createWindow () {

  // Create the browser window.
  mainWindow = new BrowserWindow({ width: 1600, height: 900 })

  // and load the index.html of the app.
  mainWindow.loadFile(homePage)
 
  if (isDev) {
    // Open the DevTools.
    mainWindow.webContents.openDevTools()
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', () => {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
    app.quit();
  })

  workerWindow = new BrowserWindow({ width: 1000, height: 500, show: isDev });

  workerWindow.loadFile(workerPage);

  if (isDev) {
    workerWindow.webContents.openDevTools();
  }

  workerWindow.on('closed', () => {
    workerWindow = null;
  });

  workerWindow.webContents.on('did-finish-load', function () {
    workerReady = true;
    sendAllPendingWorkerEvents();
  })

  preferencesService.initialize();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', createWindow)

// Quit when all windows are closed.
app.on('window-all-closed', () => {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})

addIpcListeners();
// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

function addIpcListeners() {
  ipcMain.on('close-file', function () {
    currentFilePath = '';
    setCurrentWindowTitle(baseWindowTitle);
    disableFileMenuItems();
  });
  
  ipcMain.on('file-loaded', function (event, file) {
    currentFilePath = file.path;
    mainWindow.webContents.send('file-loaded', file);

    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
    enableFileMenuItems();
  });

  ipcMain.on('reveal-in-explorer', function () {
    if (currentFilePath) {
      shell.showItemInFolder(currentFilePath);
    }
  });

  ipcMain.on('save-file', function () {
    mainWindow.webContents.send('save-file');
  });

  ipcMain.on('import-file', function () {
    mainWindow.webContents.send('import-file');
  });

  ipcMain.on('export-file', function () {
    mainWindow.webContents.send('export-file');
  });
  
  ipcMain.on('saving', function () {
    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath} - Saving...`);
  });
  
  ipcMain.on('saved', function () {
    setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath} - Saved`);
  
    setTimeout(() => {
      setCurrentWindowTitle(`${baseWindowTitle} - ${currentFilePath}`);
    }, 2000);
  });
  
  ipcMain.on('read-schema', function (event, arg) {
    passOrDelayWorkerIpcEvent('read-schema', arg);
  });

  ipcMain.on('read-schema-done', function (event, arg) {
    passOrDelayMainIpcEvent('read-schema-done', arg);
  });
}

function passOrDelayWorkerIpcEvent(event, ...arg) {
  if (workerReady) {
    workerWindow.webContents.send(event, arg)
  } else {
    pendingWorkerEvents.push({
      'event': 'read-schema',
      'args': arg
    });
  }
};

function passOrDelayMainIpcEvent(event, ...arg) {
  mainWindow.webContents.send(event, arg);
};

function setCurrentWindowTitle(title) {
  mainWindow.setTitle(title);
};

function sendAllPendingWorkerEvents() {
  pendingWorkerEvents.forEach((event) => {
    workerWindow.webContents.send(event.event, event.arg);
  });
};

function enableFileMenuItems() {
  enableMenuIds(fileDependentMenuItems);
};

function disableFileMenuItems() {
  disableMenuIds(fileDependentMenuItems);
};

function enableMenuIds(menuItems) {
  return mutateMenuIds(menuItems, 'enabled', true);
};

function disableMenuIds(menuItems) {
  return mutateMenuIds(menuItems, 'enabled', false);
};

function mutateMenuIds(menuItems, key, value) {
  const menu = Menu.getApplicationMenu();

  if (menu) {
    menuItems.forEach((id) => {
      const item = menu.getMenuItemById(id);
      if (item) {
        item[key] = value;
      }
    });
  }
};