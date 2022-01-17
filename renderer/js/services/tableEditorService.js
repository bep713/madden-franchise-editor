const { ipcRenderer, shell } = require('electron');
// const d3 = require('d3');
const { dialog, getCurrentWindow } = require('@electron/remote');
// const d3Drag = require('d3-drag');
const Selectr = require('../libs/selectr/selectr');
const utilService = require('./utilService');
const Handsontable = require('handsontable').default;
const pinnedTableService = require('./pinnedTableService');
const externalDataService = require('./externalDataService');
const referenceViewerService = require('./referenceViewerService');
const contextMenuService = require('./table-editor/contextMenuService');

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
tableEditorService.referenceEditorSelector = null;

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
  // initializeCustomEditors();
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

    tableEditorService.initialLoadTable();
    initializePins(file.gameYear);
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
  ipcRenderer.removeListener('export-raw-table', onExportRawTable);
  ipcRenderer.removeListener('export-frt', onExportFrt);
  ipcRenderer.removeListener('import-raw-table', onImportRawTable);
  window.removeEventListener('resize', windowResizeListener);
  window.removeEventListener('keydown', modalCloseListener);
  window.removeEventListener('keydown', onKeyOpenJumpToColumnModal);
};

tableEditorService.initialLoadTable = function () {
  const tableChoices = tableEditorService.file.tables.map((table, index) => {
    // console.log(table.name);
    return {
      'value': table.header.tableId,
      'text': `${index} - (${table.header.tableId}) ${table.name}`,
      'data-search-params': [index, table.header.tableId, table.name]
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
        
        tableEditorService.navSteps.push({
          'tableId': table.header.tableId,
          'recordIndex': tableEditorService.hot.getSelectedLast()[0],
          'column': tableEditorService.hot.getSelectedLast()[1]
        });
    
      }).catch((err) => {
        console.log(err);
        loadTable(table);
    
        tableEditorService.navSteps.push({
          'tableId': table.header.tableId,
          'recordIndex': 0,
          'column': 0
        });
      })
      .finally(() => {
        tableEditorService.selectedTable = table;
    
        if (tableEditorService.navSteps.length >= 2) {
          backLink.classList.remove('disabled');
        }
    
        toggleAddPinButton(table.header.tableId);
      });
    }, 100);
  });

  initializeCustomEditors();
  
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

tableEditorService.showReferenceViewer = (referencedRecordData, references) => {
  referenceViewerService.showReferenceViewer(referencedRecordData, references);
};

module.exports = tableEditorService;

function addIpcListeners() {
  ipcRenderer.on('preferencesUpdated', onPreferencesUpdated);
  ipcRenderer.on('export-file', onExportFile);
  ipcRenderer.on('import-file', onImportFile);
  ipcRenderer.on('log-table', onLogTable);
  ipcRenderer.on('export-raw-table', onExportRawTable);
  ipcRenderer.on('export-frt', onExportFrt);
  ipcRenderer.on('import-raw-table', onImportRawTable);
};

function onPreferencesUpdated(e, preferences) {
  tableEditorService.file.settings = {
    'saveOnChange': preferences.general.autoSave[0]
  };
};

function onExportFile() {
  let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
    'title': 'Select destination file for table export',
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

        if (ipcRenderer.sendSync('getPreferences').general.openExcelAfterImport[0]) {
          shell.openItem(filePath);
        }
      }).catch((err) => {
        ipcRenderer.send('export-error');
        dialog.showErrorBox('Unable to export', 'Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.');
        utilService.hide(loader);
      });
    }, 0)
  }
};

function onImportFile() {
  let filePath = dialog.showOpenDialogSync(getCurrentWindow(), {
    'title': 'Select file for table import',
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

        tableEditorService.selectedTable.recalculateEmptyRecordReferences();

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

function onExportRawTable() {
  let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
    'title': 'Select destination file for raw table export',
    'filters': [
      {name: 'DAT file', extensions: ['dat']}
    ]
  });

  if (filePath) {
    utilService.show(loader);

    setTimeout(() => {
      ipcRenderer.send('exporting');
      externalDataService.exportRawTableData({
        'outputFilePath': filePath
      }, tableEditorService.selectedTable).then(() => {
        utilService.hide(loader);
        ipcRenderer.send('exported');
      }).catch((err) => {
        ipcRenderer.send('export-error');
        dialog.showErrorBox('Unable to export', 'Unable to export the table because it is currently open in another program. Try closing the file in Excel before exporting.');
        utilService.hide(loader);
      });
    }, 0)
  }
};

function onExportFrt() {
  let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
    'title': 'Select destination file for raw FRT file export',
    'filters': [
      {name: 'FRT file', extensions: ['frt']}
    ]
  });

  if (filePath) {
    utilService.show(loader);

    setTimeout(() => {
      ipcRenderer.send('exporting');
      externalDataService.exportFrt({
        'outputFilePath': filePath
      }, tableEditorService.file).then(() => {
        utilService.hide(loader);
        ipcRenderer.send('exported');
      }).catch((err) => {
        ipcRenderer.send('export-error');
        dialog.showErrorBox('Unable to export', 'Unable to export FRT because it is currently open in another program. Try closing the file in Excel before exporting.');
        utilService.hide(loader);
      });
    }, 0)
  }
};

function onImportRawTable() {
  let filePath = dialog.showOpenDialogSync(getCurrentWindow(), {
    'title': 'Select the file to import',
    'filters': [
      {name: 'DAT file', extensions: ['dat', '*']},
    ]
  });

  if (filePath) {
    utilService.show(loader);

    setTimeout(() => {
      ipcRenderer.send('importing');

      externalDataService.importRawTable({
        filePath: filePath[0]
      }, tableEditorService.selectedTable).then(() => {
        loadTable(tableEditorService.selectedTable);
        utilService.hide(loader);
        ipcRenderer.send('imported');
      }).catch((err) => {
        ipcRenderer.send('import-error');
        dialog.showErrorBox('Unable to import', 'Unable to import the raw file. Please make sure its in the correct franchise table format.');
        utilService.hide(loader);
      });
    }, 0)
  }
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
    // columnSorting: true,
    rowHeaders: function (index) {
      return index;
    },
    contextMenu: contextMenuService.getContextMenu(tableEditorService)
  });
};

function processSelection(row, col, row2, col2) {
  tableEditorService.currentlySelectedRow = row;
  tableEditorService.currentlySelectedColumn = col;
};

function processChanges(changes, source) {
  if (changes && source !== 'onEmpty') {
    const flipSaveOnChange = tableEditorService.file.settings.saveOnChange;
    tableEditorService.file.settings = {
      'saveOnChange': false
    };

    changes.forEach((change) => {
      const recordIndex = tableEditorService.hot.toPhysicalRow(change[0]);
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
  referenceViewerService.eventEmitter.on('reference-clicked', (referenceData) => {
    tableEditorService.tableSelector.setValue(referenceData.tableId);
  });

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
      const typeLength = ((offset.type.length + 6) * 9) + 35;
      calculatedWidth = typeLength > 350 ? typeLength : 350;
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
        'renderer': offset.type === 'Spline' ? referenceRenderer : offset.isReference ? referenceRenderer : offset.enum || offset.type === 'bool' ? 'dropdown' : 'text',
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
    const otherTableFlag = value[0];
    
    if (otherTableFlag === '0') {
      const tableId = utilService.bin2dec(value.substring(2,15));
      const recordIndex = utilService.bin2dec(value.substring(16));
      const table = tableEditorService.file.getTableById(tableId);

      const referenceWrapper = document.createElement('div');
      
      if (tableId > 0 && table) {
        cellProperties.editor = false;

        const referenceLink = document.createElement('a');
        referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
        referenceWrapper.appendChild(referenceLink);

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
        referenceWrapper.innerHTML = value;
      }

      // Allow user to manually edit the reference
      referenceWrapper.classList.add('table-cell--with-button', 'table-cell-button--show-on-hover');
      const referenceEditorButton = document.createElement('button');
      referenceEditorButton.classList.add('table-cell-button', 'table-cell-button--right', 'edit-button');
      referenceWrapper.appendChild(referenceEditorButton);

      referenceEditorButton.addEventListener('click', referenceEditorOnClick);
      // referenceEditorButton.addEventListener('mousedown', function (e) { e.stopPropagation(); });

      function referenceEditorOnClick() {
        const referenceEditorWrapper = document.getElementById('reference-editor-wrapper');
        referenceEditorWrapper.classList.remove('hidden');
        referenceEditorWrapper.dataset.selectedRow = row;
        referenceEditorWrapper.dataset.selectedCol = col;

        const referenceEditorContent = document.getElementById('reference-editor-content');
        const referenceEditorHighlight = document.getElementById('reference-editor-highlight');

        const referenceEditorClientRect = referenceEditorContent.getBoundingClientRect();
        const tdClientRect = td.getBoundingClientRect();
        const windowClientRect = document.body.getBoundingClientRect();
        
        const referenceEditorShouldDisplayOnTop = (tdClientRect.bottom + referenceEditorClientRect.height) >= (windowClientRect.bottom - 20);

        if (referenceEditorShouldDisplayOnTop) {
          referenceEditorContent.style.top = (tdClientRect.top - referenceEditorClientRect.height) + 'px';
        }
        else {
          referenceEditorContent.style.top = tdClientRect.bottom + 'px';
        }

        referenceEditorContent.style.left = tdClientRect.left + 'px';

        referenceEditorHighlight.style.top = tdClientRect.top + 'px';
        referenceEditorHighlight.style.left = tdClientRect.left + 'px';
        referenceEditorHighlight.style.width = tdClientRect.width + 'px';
        referenceEditorHighlight.style.height = tdClientRect.height + 'px';

        tableEditorService.referenceEditorSelector.setValue(tableId);
        
        const rowInput = document.getElementById('reference-editor-row');
        rowInput.value = recordIndex;

        const binaryInput = document.getElementById('reference-editor-binary');
        binaryInput.value = value;
      };

      td.appendChild(referenceWrapper);
    } else {
      td.innerHTML = value;
    }
  } else {
    td.innerHTML = value;
  }

  return td;
};

function splineRenderer(instance, td, row, col, prop, value, cellProperties) {  
  referenceRenderer(instance, td, row, col, prop, value, cellProperties);

  td.classList.add('table-cell--button');
  const splineEditorButton = document.createElement('button');
  splineEditorButton.classList.add('table-cell-button', 'table-cell-button--right', 'edit-spline-button');

  splineEditorButton.addEventListener('click', splineClickListener);
  splineEditorButton.addEventListener('mousedown', function (e) { e.stopPropagation(); });

  function splineClickListener(e) {
    e.stopPropagation();

    const splineGraphWrapper = document.querySelector('.spline-editor-wrapper');
    splineGraphWrapper.classList.remove('hidden');
  };

  td.appendChild(splineEditorButton);
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

function initializeCustomEditors() {
  initializeReferenceEditor();
};

function initializeReferenceEditor() {
  const referenceEditorWrapper = document.getElementById('reference-editor-wrapper');
  tableEditorService.referenceEditorWrapper = referenceEditorWrapper;

  const referenceEditorSelector = document.getElementById('reference-editor-table');
  const data = [{
    'value': 0,
    'text': `no table - null value`,
    'data-search-params': ['null', 'empty', '0']
  }, ...tableEditorService.tableSelector.data];

  tableEditorService.referenceEditorSelector = new Selectr(referenceEditorSelector, {
    data: data
  });

  tableEditorService.referenceEditorSelector.on('selectr.change', updateBinaryInput);

  const closeButton = referenceEditorWrapper.querySelector('.close');
  closeButton.addEventListener('click', () => {
    referenceEditorWrapper.classList.add('hidden');
  });

  const underlay = referenceEditorWrapper.querySelector('.reference-editor-underlay');
  underlay.addEventListener('click', () => {
    referenceEditorWrapper.classList.add('hidden');
  });

  const rowIndex = document.getElementById('reference-editor-row');
  rowIndex.addEventListener('change', updateBinaryInput);

  const binaryInput = document.getElementById('reference-editor-binary');
  binaryInput.addEventListener('change', () => {
    const tableId = utilService.bin2dec(binaryInput.value.substring(2,15));
    const recordIndex = utilService.bin2dec(binaryInput.value.substring(16));

    tableEditorService.referenceEditorSelector.setValue(tableId);

    const rowIndex = document.getElementById('reference-editor-row');
    rowIndex.value = recordIndex;
  });

  const change = document.getElementById('btn-change-reference');
  change.addEventListener('click', () => {
    const tableId = tableEditorService.referenceEditorSelector.getValue();
    const row = document.getElementById('reference-editor-row').value;
    const newReference = utilService.calculateReferenceBinary(tableId, row);

    const hotRow = parseInt(referenceEditorWrapper.dataset.selectedRow);
    const hotCol = parseInt(referenceEditorWrapper.dataset.selectedCol)
    tableEditorService.hot.setDataAtCell(hotRow, hotCol, newReference);
  });

  function updateBinaryInput() {
    const tableId = tableEditorService.referenceEditorSelector.getValue();
    const newReference = utilService.calculateReferenceBinary(tableId, rowIndex.value);
    const binaryInput = document.getElementById('reference-editor-binary');
    binaryInput.value = newReference;
  };
};

function initializePins(gameYear) {
  pinnedTableService.initialize(gameYear);
  
  const pinListElement = document.querySelector('.pins-list');
  utilService.removeChildNodes(pinListElement);
  pinListElement.appendChild(createAddNewPinButton());

  pinnedTableService.applicablePins.forEach((pin) => {
    const pinElement = createPinElement(pin);
    pinListElement.appendChild(pinElement);
  });

  function createPinElement(pin) {
    const pinWrapper = document.createElement('div');
    pinWrapper.classList.add('pin-wrapper');

    const pinElement = document.createElement('div');
    pinElement.classList.add('pin', 'action-button');
    pinElement.innerText = `(${pin.tableId}) ${pin.tableName}`;
    pinElement.setAttribute('tableId', pin.tableId);

    const deletePinButton = document.createElement('div');
    deletePinButton.classList.add('delete-pin', 'action-button');
    
    deletePinButton.addEventListener('click', function () {
      pinnedTableService.removePin(pin.tableId);
      pinWrapper.parentNode.removeChild(pinWrapper);
      
      if (tableEditorService.selectedTable.header.tableId === pin.tableId) {
        toggleAddPinButton(pin.tableId);
      }
    });
    
    pinElement.addEventListener('click', function () {
      tableEditorService.tableSelector.setValue(pin.tableId);
    });

    pinWrapper.appendChild(pinElement);
    pinWrapper.appendChild(deletePinButton);

    return pinWrapper;
  };

  function createAddNewPinButton() {
    const addPinButton = document.createElement('div');
    addPinButton.classList.add('add-new-pin', 'action-button');
    addPinButton.innerText = '+ Add';

    addPinButton.addEventListener('click', function () {
      const selectedTableId = tableEditorService.selectedTable.header.tableId;
      const selectedTableName = tableEditorService.selectedTable.header.name;

      const tableAlreadyPinned = pinnedTableService.findPin(selectedTableId);

      if (!tableAlreadyPinned) {
        pinnedTableService.addPin(selectedTableId, selectedTableName);
        pinListElement.appendChild(createPinElement({'tableId': selectedTableId, 'tableName': selectedTableName}), addPinButton);
        utilService.hide(addPinButton);
      }
    });

    return addPinButton;
  };
};

function toggleAddPinButton(tableId) {
  const tableIsPinned = pinnedTableService.findPin(tableId);
  const addNewPinButton = document.querySelector('.add-new-pin');

  if (tableIsPinned) {
    utilService.hide(addNewPinButton);
  }
  else {
    utilService.show(addNewPinButton);
  }
};

// function initializeSplineEditor() {
//   var margin = {top: 10, right: 40, bottom: 30, left: 30},
//         width = 450 - margin.left - margin.right,
//         height = 400 - margin.top - margin.bottom;

//     const splineSvg = d3.select('#spline-editor-area')
//       .append('svg')
//         .attr('width', width + margin.left + margin.right)
//         .attr('height', height + margin.top + margin.bottom)
//       .append('g')
//         .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

//     const x = d3.scaleLinear()
//       .domain([0, 100])
//       .range([0, width]);

//     splineSvg
//       .append('g')
//       .attr('transform', 'translate(0,' + height + ')')
//       .call(d3.axisBottom(x));

//     const y = d3.scaleLinear()
//       .domain([0, 100])
//       .range([0, height]);

//     splineSvg
//       .append('g')
//       .call(d3.axisLeft(y));
// };