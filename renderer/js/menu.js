(function () {
  import { Menu, dialog, app, BrowserWindow } from 'electron';
  import menuHelper from './menuHelper';
  import fileHelper from './fileHelper';

  const template = [
    {
      label: 'File',
      submenu: [
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
        // {
        //   type: 'separator'
        // },
        // {
        //   id: 'RevealInExplorer',
        //   label: 'Reveal in Explorer',
        //   accelerator: 'CmdOrCtrl+Shift+E',
        //   click: menuHelper.doRevealInExplorer,
        //   enabled: false
        // }
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
})();