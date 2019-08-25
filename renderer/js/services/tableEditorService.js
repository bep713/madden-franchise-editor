const { ipcRenderer, remote, shell } = require('electron');
const app = remote.app;
const dialog = remote.dialog;
const Selectr = require('mobius1-selectr');
const utilService = require('./utilService');
const Handsontable = require('handsontable').default;
const externalDataService = require('./externalDataService');

let tableEditorService = {};
tableEditorService.name = 'tableEditorService';
tableEditorService.file = null;
tableEditorService.hot = null;
tableEditorService.tableSelector = null;
tableEditorService.selectedTable = null;
tableEditorService.showHeaderTypes = false;
tableEditorService.navSteps = [];
tableEditorService.rowIndexToSelect = 0;
tableEditorService.columnIndexToSelect = 0;
tableEditorService.initialTableSelect = null;
tableEditorService.currentlySelectedRow = 0;
tableEditorService.currentlySelectedColumn = 0;

let loader;

function windowResizeListener () {
  tableEditorService.hot.updateSettings({
    width: document.querySelector('.table-wrapper').offsetWidth
  });
};

function modalCloseListener (e) {
  if (e.which === 27) {
    const modalsToHide = document.querySelectorAll('.modal:not(.hidden)');
    modalsToHide.forEach((modal) => {
      modal.classList.add('hidden');
    });

    const underlay = document.querySelector('.underlay');
    underlay.classList.add('hidden');

    tableEditorService.hot.selectCell(tableEditorService.currentlySelectedRow, tableEditorService.currentlySelectedColumn);
  }
};

function onKeyOpenJumpToColumnModal (e) {
  if (e.which === 74 && e.ctrlKey) {
    tableEditorService.hot.deselectCell();
    document.querySelector('.jump-to-column').click();
  }
};

tableEditorService.start = function (file) {
  addIpcListeners();
  initializeTable();
  addEventListeners();

  if (file.isLoaded) {
    runStartTasks();
  } else {
    file.on('ready', function () {
      runStartTasks();
    });
  }

  function runStartTasks() {
    tableEditorService.file = file;
    file.settings = {
      'saveOnChange': ipcRenderer.sendSync('getPreferences').general.autoSave[0]
    };

    tableEditorService.loadTable();
  }
};

tableEditorService.onClose = function () {
  tableEditorService.navSteps = [];
  tableEditorService.rowIndexToSelect = 0;
  tableEditorService.columnIndexToSelect = 0;
  tableEditorService.selectedTable = null;
  tableEditorService.hot.destroy();
  tableEditorService.hot = null;
  tableEditorService.file.settings = {
    'saveOnChange': false
  };
  tableEditorService.file = null;
  tableEditorService.initialTableSelect = null;
  tableEditorService.currentlySelectedRow = 0;
  tableEditorService.currentlySelectedColumn = 0;
  
  ipcRenderer.removeListener('preferencesUpdated', onPreferencesUpdated);
  ipcRenderer.removeListener('export-file', onExportFile);
  ipcRenderer.removeListener('import-file', onImportFile);
  ipcRenderer.removeListener('log-table', onLogTable);
  window.removeEventListener('resize', windowResizeListener);
  window.removeEventListener('keydown', modalCloseListener);
  window.removeEventListener('keydown', onKeyOpenJumpToColumnModal);
};

tableEditorService.loadTable = function () {
  const tableChoices = tableEditorService.file.tables.map((table, index) => {
    // console.log(table.name);
    return {
      'value': table.header.tableId,
      'text': `${index} - ${table.name}`
    };
  });

  if (tableChoices.length === 0) {
    console.log('cannot load the table editor because the file appears to be corrupt.');
  }

  const tableSelector = document.querySelector('.table-selector');
  tableEditorService.tableSelector = new Selectr(tableSelector, {
    data: tableChoices
  });

  const backLink = document.querySelector('.back-link');

  tableEditorService.tableSelector.on('selectr.change', function (option) {
    utilService.show(loader);

    setTimeout(() => {
      const tableId = parseInt(tableEditorService.tableSelector.getValue(true).value);
      const table = tableEditorService.file.getTableById(tableId);

      table.readRecords().then((table) => {
        loadTable(table);
        tableEditorService.hot.selectCell(tableEditorService.rowIndexToSelect, tableEditorService.columnIndexToSelect);

        tableEditorService.rowIndexToSelect = 0;
        tableEditorService.columnIndexToSelect = 0;

        tableEditorService.selectedTable = table;

        tableEditorService.navSteps.push({
          'tableId': tableId,
          'recordIndex': tableEditorService.hot.getSelectedLast()[0],
          'column': tableEditorService.hot.getSelectedLast()[1]
        });

        if (tableEditorService.navSteps.length >= 2) {
          backLink.classList.remove('disabled');
        }
      }).catch((err) => {
        console.log(err);
        loadTable(table);
      });
    }, 100);
  });
  
  if (tableEditorService.initialTableToSelect) {
    tableEditorService.rowIndexToSelect = tableEditorService.initialTableToSelect.recordIndex;
    tableEditorService.columnIndexToSelect = 0;

    tableEditorService.tableSelector.setValue(tableEditorService.initialTableToSelect.tableId);
    tableEditorService.initialTableToSelect = null;
  } else {
    tableEditorService.tableSelector.setValue(tableChoices[1].value);

    const tableToLoad = tableEditorService.file.getAllTablesByName(tableChoices[1].text.substring(tableChoices[1].text.indexOf(' ') + 3));
    tableEditorService.selectedTable = tableToLoad[tableToLoad.length - 1];
  }
};

module.exports = tableEditorService;

function addIpcListeners() {
  ipcRenderer.on('preferencesUpdated', onPreferencesUpdated);
  ipcRenderer.on('export-file', onExportFile);
  ipcRenderer.on('import-file', onImportFile);
  ipcRenderer.on('log-table', onLogTable);
};

function onPreferencesUpdated(e, preferences) {
  tableEditorService.file.settings = {
    'saveOnChange': preferences.general.autoSave[0]
  };
};

function onExportFile() {
  let filePath = dialog.showSaveDialog(remote.getCurrentWindow(), {
    'title': 'Select destination file for table export',
    'defaultPath': app.getPath('documents'),
    'filters': [
      {name: 'Excel workbook', extensions: ['xlsx']},
      {name: 'CSV (comma-delimited)', extensions: ['csv']},
      {name: 'Excel Macro-Enabled Workbook', extensions: ['xlsm']},
      {name: 'Excel Binary Workbook', extensions: ['xlsb']},
      {name: 'Excel 97-2003 Workbook', extensions: ['xls']},
      {name: 'OpenDocument Spreadsheet', extensions: ['ods']},
      {name: 'UTF-16 Unicode Text', extensions: ['txt']}]
  });

  if (filePath) {
    utilService.show(loader);

    setTimeout(() => {
      ipcRenderer.send('exporting');
      externalDataService.exportTableData({
        'outputFilePath': filePath
      }, tableEditorService.selectedTable).then(() => {
        utilService.hide(loader);
        ipcRenderer.send('exported');
        shell.openItem(filePath);
      }).catch((err) => {
        ipcRenderer.send('export-error');
        dialog.showErrorBox('Unable to export', 'Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.');
        utilService.hide(loader);
      });
    }, 0)
  }
};

function onImportFile() {
  let filePath = dialog.showOpenDialog(remote.getCurrentWindow(), {
    'title': 'Select file for table import',
    'defaultPath': app.getPath('documents'),
    'filters': [
      {name: 'Excel workbook', extensions: ['xlsx']},
      {name: 'CSV (comma-delimited)', extensions: ['csv']},
      {name: 'Excel Macro-Enabled Workbook', extensions: ['xlsm']},
      {name: 'Excel Binary Workbook', extensions: ['xlsb']},
      {name: 'Excel 97-2003 Workbook', extensions: ['xls']},
      {name: 'OpenDocument Spreadsheet', extensions: ['ods']},
      {name: 'UTF-16 Unicode Text', extensions: ['txt']}]
  });

  if (filePath) {
    utilService.show(loader);

    setTimeout(() => {
      ipcRenderer.send('importing');
      externalDataService.importTableData({
        'inputFilePath': filePath[0]
      }).then((table) => {
        const flipSaveOnChange = tableEditorService.file.settings.saveOnChange;
        tableEditorService.file.settings = {
          'saveOnChange': false
        };

        // do not allow rows to be added.
        const trimmedTable = table.slice(0, tableEditorService.selectedTable.records.length);
        trimmedTable.forEach((record, index) => {
          let franchiseRecord = tableEditorService.selectedTable.records[index];

          Object.keys(record).forEach((key) => {
            if (franchiseRecord[key] !== record[key]) {
              franchiseRecord[key] = record[key];
            }
          });
        });

        ipcRenderer.send('imported');

        if (flipSaveOnChange) {
          tableEditorService.file.save();
          tableEditorService.file.settings = {
            'saveOnChange': true
          };
        }

        loadTable(tableEditorService.selectedTable);
      });
    }, 10)
  }
};

function onLogTable() {
  console.log(tableEditorService.selectedTable);
};

function initializeTable() {
  const container3 = document.querySelector('.table-content-wrapper');
  tableEditorService.hot = new Handsontable(container3, {
    rowHeaders: true,
    currentRowClassName: 'active-row',
    manualColumnResize: true,
    manualRowResize: true,
    afterChange: processChanges,
    afterSelection: processSelection,
    rowHeaders: function (index) {
      return index;
    }
  });
};

function processSelection(row, col, row2, col2) {
  tableEditorService.currentlySelectedRow = row;
  tableEditorService.currentlySelectedColumn = col;
};

function processChanges(changes) {
  if (changes) {
    const flipSaveOnChange = tableEditorService.file.settings.saveOnChange;
    tableEditorService.file.settings = {
      'saveOnChange': false
    };

    changes.forEach((change) => {
      const recordIndex = change[0];
      const key = change[1];
      const oldValue = change[2];
      const newValue = change[3];

      const colNumber = tableEditorService.selectedTable.offsetTable.findIndex((offset) => { return offset.name === key; });

      try {
        let field = tableEditorService.selectedTable.records[recordIndex].getFieldByKey(key);
        field.value = newValue;

        if (field.value !== newValue) {
          tableEditorService.hot.setDataAtCell(recordIndex, colNumber, field.value);
        }
      }
      catch (err) {
        tableEditorService.hot.setDataAtCell(recordIndex, colNumber, oldValue)
      }
    });

    if (flipSaveOnChange) {
      tableEditorService.file.save();
      tableEditorService.file.settings = {
        'saveOnChange': true
      };
    }
  }
};

function addEventListeners() {
  const jumpToColumnModal = document.querySelector('.jump-to-column-modal');
  const underlay = document.querySelector('.underlay');
  const jumpRow = document.querySelector('.jump-row');
  loader = document.querySelector('.loader-wrapper');

  window.addEventListener('resize', windowResizeListener);
  window.addEventListener('keydown', modalCloseListener);
  window.addEventListener('keydown', onKeyOpenJumpToColumnModal);

  const toggleTypesButton = document.querySelector('.toggle-types');
  toggleTypesButton.addEventListener('click', function () {
    tableEditorService.showHeaderTypes = !tableEditorService.showHeaderTypes;
    const headers = formatHeaders(tableEditorService.selectedTable);

    tableEditorService.hot.updateSettings({
      colHeaders: headers
    });
  });

  const columnSelect = document.querySelector('#available-columns');
  let columnSelectr = new Selectr(columnSelect, {
    data: null
  });

  const closeModalButton = document.querySelector('.close-modal');
  closeModalButton.addEventListener('click', function () {
    jumpToColumnModal.classList.add('hidden');
    underlay.classList.add('hidden');
  });

  const jumpToColumnButton = document.querySelector('.jump-to-column');
  jumpToColumnButton.addEventListener('click', jumpToColumnListener);

  const goJumpToColumnButton = document.querySelector('.btn-go-jump-to-column');
  goJumpToColumnButton.addEventListener('click', goJumpToColumnListener);

  function jumpToColumnListener() {
    jumpRow.value = tableEditorService.currentlySelectedRow;
    const headers = formatHeaders(tableEditorService.selectedTable);
    const options = headers.map((header) => {
      return {
        'value': header,
        'text': header
      };
    });

    columnSelectr.removeAll();
    columnSelectr.add(options);

    setTimeout(() => {
      columnSelect.focus();
    }, 200);

    window.addEventListener('keydown', onEnterJumpToColumn);

    jumpToColumnModal.classList.remove('hidden');
    underlay.classList.remove('hidden');

    setTimeout(() => {
      document.querySelector('.modal .selectr-selected').click();

      setTimeout(() => {
        document.querySelector('.modal .selectr-input').focus();
      }, 200);
    }, 50);
  };

  function onEnterJumpToColumn (e) {
    if (e.which === 13) {
      goJumpToColumnListener();
    }
  };
  
  function goJumpToColumnListener () {
    const value = columnSelectr.getValue();
    let index = columnSelectr.data.findIndex((opt) => { return opt.value === value; });
  
    if (index === -1) {
      index = 0;
    }
  
    jumpToColumnModal.classList.add('hidden');
    underlay.classList.add('hidden');
  
    let row = parseInt(jumpRow.value);
  
    if (!row || row < 0) {
      row = 0;
    }
  
    tableEditorService.navSteps.push({
      'tableId': tableEditorService.selectedTable.header.tableId,
      'recordIndex': row,
      'column': index
    });
  
    window.removeEventListener('keypress', onEnterJumpToColumn);
    tableEditorService.hot.selectCell(row, index);
  };

  const backLink = document.querySelector('.back-link');
  backLink.addEventListener('click', function () {

    if (tableEditorService.navSteps.length >= 2) {
      tableEditorService.navSteps.pop();

      const navStep = tableEditorService.navSteps[tableEditorService.navSteps.length - 1];
      const table = tableEditorService.file.getTableById(navStep.tableId);

      tableEditorService.rowIndexToSelect = navStep.recordIndex;
      tableEditorService.columnIndexToSelect = navStep.column;

      tableEditorService.tableSelector.setValue(navStep.tableId);
      tableEditorService.navSteps.pop();

      tableEditorService.selectedTable = table;

      setTimeout(() => {
        if (tableEditorService.navSteps.length === 1) {
          backLink.classList.add('disabled');
        }
      }, 200);
    }
  });
};

function loadTable(table) {
  const data = formatTable(table);
  const headers = formatHeaders(table);
  const columns = formatColumns(table);

  tableEditorService.hot.loadData(data);
  tableEditorService.hot.updateSettings({
    data: data,
    colHeaders: headers,
    columns: columns,
    colWidths: calculateColumnWidths(columns, table)
  });

  tableEditorService.hot.selectCell(tableEditorService.rowIndexToSelect, tableEditorService.columnIndexToSelect);

  utilService.hide(loader);
};

function calculateColumnWidths(columns, table) {
  let widths = columns.map((col, index) => {
    const offset = table.offsetTable[index];
    const colMinWidth = ((col.data.length * 9) + 26);
    let calculatedWidth = 0;

    if (offset.isReference || offset.enum) {
      calculatedWidth = 350;
    }
    else if (offset.maxLength) {
      calculatedWidth = (offset.maxLength * 9) + 26;
    }
    else if (offset.type === 'bool') {
      calculatedWidth = 80;
    }
    else {
      calculatedWidth = (offset.length * 9) + 26;
    }

    return colMinWidth > calculatedWidth ? colMinWidth : calculatedWidth;
  });
  
  return widths;
}

function formatTable(table) {
  return table.records.map((record) => {
    return record._fields.reduce((accumulator, currentValue) => {
      accumulator[currentValue.key] = currentValue.value;
      return accumulator;
    }, {});
  });
};

function formatHeaders(table) {
  if (table.offsetTable) {
    if (tableEditorService.showHeaderTypes) {
      return table.offsetTable.map((offset) => {
        return `${offset.name} <div class="header-type">${offset.type}</div>`;
      });
    } else {
      return table.offsetTable.map((offset) => {
        return offset.name;
      });
    }
  } else {
    return [];
  }
};

function formatColumns(table) {
  if (table.offsetTable) {
    return table.offsetTable.map((offset) => {
      return {
        'data': offset.name,
        'renderer': offset.isReference ? referenceRenderer : offset.enum || offset.type === 'bool' ? 'dropdown' : 'text',
        'wordWrap': false,
        'editor': offset.enum || offset.type === 'bool' ? 'dropdown' : 'text',
        'source': offset.enum ? offset.enum.members.map((member) => { return member.name; }) : offset.type === 'bool' ? ['true', 'false'] : []
      };
    });
  } else {
    return [];
  }
};

function referenceRenderer(instance, td, row, col, prop, value, cellProperties) {
  if (value && value.length === 32) {
    utilService.removeChildNodes(td);
    const referenceLink = document.createElement('a');
    const otherTableFlag = value[0];

    if (otherTableFlag === '0') {
      const tableId = utilService.bin2dec(value.substring(2,15));
      const recordIndex = utilService.bin2dec(value.substring(16));
      const table = tableEditorService.file.getTableById(tableId);

      if (tableId > 0 && table) {
        referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
        td.appendChild(referenceLink);

        referenceLink.addEventListener('click', function () {
          tableEditorService.navSteps[tableEditorService.navSteps.length - 1].column = col;
          tableEditorService.navSteps[tableEditorService.navSteps.length - 1].recordIndex = row;

          tableEditorService.rowIndexToSelect = recordIndex;
          tableEditorService.columnIndexToSelect = 0;

          if (table.header.tableId != tableEditorService.tableSelector.getValue()) {
            tableEditorService.tableSelector.setValue(table.header.tableId);
          } 
          else {
            tableEditorService.hot.selectCell(recordIndex, 0);
          }

          setTimeout(() => {
            tableEditorService.navSteps[tableEditorService.navSteps.length - 1].recordIndex = recordIndex;
          }, 1000);
        });
      } else {
        td.innerHTML = value;
      }
    } else {
      td.innerHTML = value;
    }
  } else {
    td.innerHTML = value;
  }

  return td;
};

function enumRenderer(instance, td, row, col, prop, value, cellProperties) {
  const colEnum = tableEditorService.selectedTable.records[0].getFieldByKey(prop).offset.enum;

  if (colEnum) {
    // const val = colEnum.getMemberByUnformattedValue(value);
    
    // td.innerHTML = val.name;
    td.innerHTML = value;
  } else {
    td.innerHTML = value;
  }

  return td;
};