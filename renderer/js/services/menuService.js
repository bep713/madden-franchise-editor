const { shell, ipcRenderer } = require('electron');
const { Menu, app, BrowserWindow } = require('electron').remote;

let menuService = {};

menuService.initializeMenu = function () {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          id: 'Import',
          label: 'Import',
          accelerator: 'CmdOrCtrl+I',
          click: menuService.importFile,
          enabled: false
        },
        {
          id: 'Export',
          label: 'Export',
          accelerator: 'CmdOrCtrl+E',
          click: menuService.exportFile,
          enabled: false
        },
        {
          id: 'Save',
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: menuService.saveFile,
          enabled: false
        },
        {
          id: 'CloseFile',
          label: 'Close File',
          accelerator: 'CmdOrCtrl+Shift+X',
          click: menuService.closeFile,
          enabled: false
        },
        {
          id: 'ShowPreferences',
          label: 'Preferences',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: menuService.openPreferencesWindow
        },
        {
          type: 'separator'
        },
        {
          role: 'quit'
        }
        // {
      //     id: 'OpenFile',
      //     label: 'Open File',
      //     accelerator: 'CmdOrCtrl+O',
      //     click: fileHelper.openFileWindow
      //   },
      //   // {
      //   //   id: 'Restore',
      //   //   label: 'Restore',
      //   //   click: fileHelper.restore,
      //   //   enabled: false
      //   // },
      //   {
      //     id: 'Save',
      //     label: 'Save',
      //     accelerator: 'CmdOrCtrl+S',
      //     click: fileHelper.saveFile,
      //     enabled: false
      //   },
      //   {
      //     id: 'SaveAs',
      //     label: 'Save As...',
      //     accelerator: 'CmdOrCtrl+Shift+S',
      //     click: fileHelper.saveAs,
      //     enabled: false
      //   },
      //   {
      //     id: 'CloseFile',
      //     label: 'Close File',
      //     accelerator: 'CmdOrCtrl+Shift+X',
      //     click: fileHelper.closeFile,
      //     enabled: false
      //   }
      ]
    },
    // {
      // label: 'Edit',
      // submenu: [
      //   {
      //     id: 'Undo',
      //     label: 'Undo',
      //     accelerator: 'CmdOrCtrl+Z',
      //     click: menuHelper.doUndo,
      //     enabled: false
      //   },
      //   {
      //     id: 'Redo',
      //     label: 'Redo',
      //     accelerator: 'CmdOrCtrl+Y',
      //     click: menuHelper.doRedo,
      //     enabled: false
      //   },
      //   {
      //     type: 'separator'
      //   },
      //   {
      //     role: 'cut'
      //   },
      //   {
      //     role: 'copy'
      //   },
      //   {
      //     role: 'paste'
      //   },
      //   {
      //     role: 'pasteandmatchstyle'
      //   },
      //   {
      //     label: 'Select All',
      //     accelerator: 'CmdOrCtrl+A',
      //     click: menuHelper.doSelectAll
      //   }
      // ]
    // },
    {
      label: 'View',
      submenu: [
        {
          role: 'reload'
        },
        {
          role: 'forcereload'
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
          click (item, focusedWindow) {
            if (focusedWindow) focusedWindow.webContents.toggleDevTools()
          }
        },
        {
          type: 'separator'
        },
        {
          role: 'resetzoom'
        },
        {
          role: 'zoomin'
        },
        {
          role: 'zoomout'
        },
        {
          type: 'separator'
        },
        {
          id: 'RevealInExplorer',
          label: 'Reveal in Explorer',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: menuService.doRevealInExplorer,
          enabled: false
        }
      ]
    },
    {
      role: 'window',
      submenu: [
        {
          role: 'minimize'
        },
        {
          role: 'close'
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          id: 'ShowOffsetHelper',
          label: 'Offset Helper',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: menuService.showOffsetHelper,
          enabled: true
        },
        {
          id: 'LogTable',
          label: 'Log Table to Console',
          accelerator: 'CmdOrCtrl+L',
          click: menuService.logTable,
          enabled: false
        },
        {
          id: 'ExportRawTable',
          label: 'Export Raw Table',
          click: menuService.exportRawTable,
          enabled: false
        },
        {
          id: 'ExportFRT',
          label: 'Export FRT File',
          click: menuService.exportFrt,
          enabled: false
        },
        {
          type: 'separator'
        },
        {
          id: 'ImportRawTable',
          label: 'Import Raw Table',
          click: menuService.importRawTable,
          enabled: false
        }
      ]
    },
    {
      label: 'About',
      submenu: [
        {
          id: 'OpenProjectHomepage',
          label: 'Open Project Homepage',
          click: menuService.openProjectHomepage
        },
        {
          id: 'Credits',
          label: 'Credits',
          click: menuService.openCredits
        },
        {
          id: 'CheckForUpdate',
          label: 'Check for Update',
          click: menuService.checkForUpdate
        },
        {
          id: 'ViewReleaseNotes',
          label: 'View Release Notes',
          click: menuService.viewReleaseNotes
        }
      ]
    }
    // {
    //   label: 'Filter',
    //   submenu: [
    //     {
    //       id: 'ShowFilterWindow',
    //       label: 'Toggle Filter Window',
    //       accelerator: 'CmdOrCtrl+Shift+F',
    //       click: menuHelper.showFilterWindow,
    //       enabled: false
    //     },
    //     {
    //       id: 'ClearFilters',
    //       label: 'Clear All Filters',
    //       accelerator: 'CmdOrCtrl+Shift+Q',
    //       click: menuHelper.clearFilters,
    //       enabled: false
    //     }
    //   ]
    // },
    // {
    //   role: 'help',
    //   submenu: [
    //     // {
    //     //   label: 'Learn More',
    //     //   click () { require('electron').shell.openExternal('http://electron.atom.io') }
    //     // }
    //   ]
    // }
  ]

  if (process.platform === 'darwin') {
    const name = app.getName()
    template.unshift({
      label: name,
      submenu: [
        {
          role: 'about'
        },
        {
          type: 'separator'
        },
        {
          role: 'services',
          submenu: []
        },
        {
          type: 'separator'
        },
        {
          role: 'hide'
        },
        {
          role: 'hideothers'
        },
        {
          role: 'unhide'
        },
        {
          type: 'separator'
        },
        {
          role: 'quit'
        }
      ]
    })
    // Edit menu.
    template[1].submenu.push(
      {
        type: 'separator'
      },
      {
        label: 'Speech',
        submenu: [
          {
            role: 'startspeaking'
          },
          {
            role: 'stopspeaking'
          }
        ]
      }
    )
    // Window menu.
    template[3].submenu = [
      {
        label: 'Close',
        accelerator: 'CmdOrCtrl+W',
        role: 'close'
      },
      {
        label: 'Minimize',
        accelerator: 'CmdOrCtrl+M',
        role: 'minimize'
      },
      {
        label: 'Zoom',
        role: 'zoom'
      },
      {
        type: 'separator'
      },
      {
        label: 'Bring All to Front',
        role: 'front'
      }
    ]
  }

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
};

menuService.importFile = function () {
  ipcRenderer.send('import-file');
};

menuService.exportFile = function () {
  ipcRenderer.send('export-file');
};

menuService.exportFrt = function () {
  ipcRenderer.send('export-frt');
};

menuService.saveFile = function () {
  ipcRenderer.send('save-file');
};

menuService.closeFile = function (menuItem, browserWindow, event) {
  browserWindow.webContents.send('close-file');
};

menuService.doRevealInExplorer = function () {
  ipcRenderer.send('reveal-in-explorer');
};

menuService.showOffsetHelper = function () {
  shell.openExternal('https://bep713.github.io/offset-tool/index.html');
};

menuService.logTable = function () {
  ipcRenderer.send('log-table');
};

menuService.exportRawTable = function () {
  ipcRenderer.send('export-raw-table');
};

menuService.importRawTable = function () {
  ipcRenderer.send('import-raw-table');
};

menuService.openPreferencesWindow = function () {
  ipcRenderer.send('showPreferences');
};

menuService.checkForUpdate = function () {
  ipcRenderer.send('check-for-update');
};

menuService.openProjectHomepage = function () {
  shell.openExternal('https://github.com/bep713/madden-franchise-editor');
};

menuService.openCredits = function () {
  ipcRenderer.send('show-credits');
};

menuService.viewReleaseNotes = function () {
  ipcRenderer.send('show-settings-manager');
};

menuService.enableMenuIds = enableMenuIds;
menuService.disableMenuIds = disableMenuIds;

module.exports = menuService;

function enableMenuIds(menuItems) {
  return mutateMenuIds(menuItems, 'enabled', true);
};

function disableMenuIds(menuItems) {
  return mutateMenuIds(menuItems, 'enabled', false);
};

function mutateMenuIds(menuItems, key, value) {
  const menu = Menu.getApplicationMenu();

  if (menu && menuItems) {
    menuItems.forEach((id) => {
      const item = menu.getMenuItemById(id);
      if (item) {
        item[key] = value;
      }
    });
  }
};