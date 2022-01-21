const { ipcRenderer, shell } = require('electron');
const { dialog, getCurrentWindow } = require('@electron/remote');

const Selectr = require('../../libs/selectr/selectr');

const utilService = require('../utilService');
const TableEditorView = require('./TableEditorView');
const pinnedTableService = require('../pinnedTableService');
const externalDataService = require('../externalDataService');
const referenceViewerService = require('../referenceViewerService');

class TableEditorWrapper {
    constructor(file) {
        this.file = file;
        this.tableEditors = [];
        this.pinListElement = null;
        this.selectedTableEditor = null;
        this.referenceEditorSelector = null;
        this.loader = document.querySelector('.loader-wrapper');

        if (file.isLoaded) {
            this.start();
        } else {
            file.on('ready', function () {
                this.start();
            });
        }
    };

    start() {
        this._addIpcListeners();
        this._addEventListeners();

        this.file.settings = {
            'saveOnChange': ipcRenderer.sendSync('getPreferences').general.autoSave[0]
        };

        this.selectedTableEditor = new TableEditorView(this.file, '.table-content-wrapper', this);
        this.tableEditors.push(this.selectedTableEditor);

        this._initializeReferenceEditor();
        this._initializePins(this.file.gameYear);
    };

    _addIpcListeners() {
        ipcRenderer.on('preferencesUpdated', this._onPreferencesUpdated);
        ipcRenderer.on('export-file', this._onExportFile);
        ipcRenderer.on('import-file', this._onImportFile);
        ipcRenderer.on('log-table', this._onLogTable);
        ipcRenderer.on('export-raw-table', this._onExportRawTable);
        ipcRenderer.on('export-frt', this._onExportFrt);
        ipcRenderer.on('import-raw-table', this._onImportRawTable);
    };

    _onPreferencesUpdated() {
        this.file.settings = {
            'saveOnChange': preferences.general.autoSave[0]
        };
    };

    _onExportFile() {
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
            utilService.show(this.loader);
        
            setTimeout(() => {
                ipcRenderer.send('exporting');
                externalDataService.exportTableData({
                    outputFilePath: filePath
                }, this.selectedTableEditor.selectedTable).then(() => {
                    utilService.hide(this.loader);
                    ipcRenderer.send('exported');
            
                    if (ipcRenderer.sendSync('getPreferences').general.openExcelAfterImport[0]) {
                        shell.openItem(filePath);
                    }
                }).catch((err) => {
                    ipcRenderer.send('export-error');
                    dialog.showErrorBox('Unable to export', 'Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.');
                    utilService.hide(this.loader);
                });
            }, 0);
        }
    };
    
    _onImportFile() {
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
            utilService.show(this.loader);
        
            setTimeout(() => {
                ipcRenderer.send('importing');
                externalDataService.importTableData({
                    inputFilePath: filePath[0]
                }).then((table) => {
                    const flipSaveOnChange = this.file.settings.saveOnChange;
                    this.file.settings = {
                        'saveOnChange': false
                    };
        
                    // do not allow rows to be added.
                    const trimmedTable = table.slice(0, this.selectedTableEditor.selectedTable.records.length);
                    trimmedTable.forEach((record, index) => {
                        let franchiseRecord = this.selectedTableEditor.selectedTable.records[index];
            
                        Object.keys(record).forEach((key) => {
                            if (franchiseRecord[key] !== record[key]) {
                                franchiseRecord[key] = record[key];
                            }
                        });
                    });
            
                    this.selectedTableEditor.selectedTable.recalculateEmptyRecordReferences();
            
                    ipcRenderer.send('imported');
            
                    if (flipSaveOnChange) {
                        this.file.save();
                        this.file.settings = {
                            'saveOnChange': true
                        };
                    }
            
                    this.selectedTableEditor.loadTable(this.selectedTableEditor.selectedTable);
                });
            }, 10)
        }
    };

    _onLogTable() {
        console.log(this.selectedTableEditor.selectedTable);
    };

    _onExportRawTable() {
        let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
          'title': 'Select destination file for raw table export',
          'filters': [
            {name: 'DAT file', extensions: ['dat']}
          ]
        });
      
        if (filePath) {
            utilService.show(this.loader);
        
            setTimeout(() => {
                ipcRenderer.send('exporting');
                externalDataService.exportRawTableData({
                    outputFilePath: filePath
                }, this.selectedTableEditor.selectedTable).then(() => {
                    utilService.hide(this.loader);
                    ipcRenderer.send('exported');
                }).catch((err) => {
                    ipcRenderer.send('export-error');
                    dialog.showErrorBox('Unable to export', 'Unable to export the table because it is currently open in another program. Try closing the file in Excel before exporting.');
                    utilService.hide(this.loader);
                });
            }, 0)
        }
    };

    _onExportFrt() {
        let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
          'title': 'Select destination file for raw FRT file export',
          'filters': [
            {name: 'FRT file', extensions: ['frt']}
          ]
        });
      
        if (filePath) {
            utilService.show(this.loader);
        
            setTimeout(() => {
                ipcRenderer.send('exporting');
                externalDataService.exportFrt({
                    'outputFilePath': filePath
                }, this.file).then(() => {
                    utilService.hide(this.loader);
                    ipcRenderer.send('exported');
                }).catch((err) => {
                    ipcRenderer.send('export-error');
                    dialog.showErrorBox('Unable to export', 'Unable to export FRT because it is currently open in another program. Try closing the file in Excel before exporting.');
                    utilService.hide(this.loader);
                });
            }, 0)
        }
    };

    _onImportRawTable() {
        let filePath = dialog.showOpenDialogSync(getCurrentWindow(), {
          'title': 'Select the file to import',
          'filters': [
            {name: 'DAT file', extensions: ['dat', '*']},
          ]
        });
      
        if (filePath) {
            utilService.show(this.loader);
        
            setTimeout(() => {
                ipcRenderer.send('importing');
        
                externalDataService.importRawTable({
                    filePath: filePath[0]
                }, this.selectedTableEditor.selectedTable).then(() => {
                    this.selectedTableEditor.loadTable(this.selectedTableEditor.selectedTable);
                    utilService.hide(this.loader);
                    ipcRenderer.send('imported');
                }).catch((err) => {
                    ipcRenderer.send('import-error');
                    dialog.showErrorBox('Unable to import', 'Unable to import the raw file. Please make sure its in the correct franchise table format.');
                    utilService.hide(this.loader);
                });
            }, 0)
        }
    };

    _addEventListeners() {
        referenceViewerService.eventEmitter.on('reference-clicked', (referenceData) => {
            this.selectedTableEditor.tableSelector.setValue(referenceData.tableId);
        });

        window.addEventListener('resize', this._windowResizeListener);
        window.addEventListener('keydown', this._modalCloseListener);
        window.addEventListener('keydown', this._onKeyOpenJumpToColumnModal);
    };

    _windowResizeListener () {
        this.selectedTableEditor.hot.updateSettings({
            width: document.querySelector('.table-wrapper').offsetWidth
        });
    };
      
    _modalCloseListener (e) {
        if (e.which === 27) {
            const modalsToHide = document.querySelectorAll('.modal:not(.hidden)');
            modalsToHide.forEach((modal) => {
                modal.classList.add('hidden');
            });
        
            const underlay = document.querySelector('.underlay');
            underlay.classList.add('hidden');
        
            this.selectedTableEditor.hot.selectCell(this.selectedTableEditor.currentlySelectedRow, this.selectedTableEditor.currentlySelectedColumn);
        }
    };
      
    _onKeyOpenJumpToColumnModal (e) {
        if (e.which === 74 && e.ctrlKey) {
            this.selectedTableEditor.hot.deselectCell();
            document.querySelector('.jump-to-column').click();
        }
    };

    _initializeReferenceEditor() {
        const referenceEditorWrapper = document.getElementById('reference-editor-wrapper');
        const referenceEditorSelector = document.getElementById('reference-editor-table');

        const data = [{
            'value': 0,
            'text': `no table - null value`,
            'data-search-params': ['null', 'empty', '0']
        }, ...this.selectedTableEditor.tableSelector.data];

        this.referenceEditorSelector = new Selectr(referenceEditorSelector, {
            data: data
        });

        const updateBinaryInput = () => {
            const tableId = this.referenceEditorSelector.getValue();
            const newReference = utilService.calculateReferenceBinary(tableId, rowIndex.value);
            const binaryInput = document.getElementById('reference-editor-binary');
            binaryInput.value = newReference;
        };

        this.referenceEditorSelector.on('selectr.change', updateBinaryInput);

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

            this.referenceEditorSelector.setValue(tableId);

            const rowIndex = document.getElementById('reference-editor-row');
            rowIndex.value = recordIndex;
        });

        const change = document.getElementById('btn-change-reference');
        change.addEventListener('click', () => {
            const tableId = this.referenceEditorSelector.getValue();
            const row = document.getElementById('reference-editor-row').value;
            const newReference = utilService.calculateReferenceBinary(tableId, row);

            const hotRow = parseInt(referenceEditorWrapper.dataset.selectedRow);
            const hotCol = parseInt(referenceEditorWrapper.dataset.selectedCol)
            this.selectedTableEditor.hot.setDataAtCell(hotRow, hotCol, newReference);
        });
    };

    _initializePins(gameYear) {
        pinnedTableService.initialize(gameYear);
  
        this.pinListElement = document.querySelector('.pins-list');
        utilService.removeChildNodes(this.pinListElement);
        this.pinListElement.appendChild(this._createAddNewPinButton());

        pinnedTableService.applicablePins.forEach((pin) => {
            const pinElement = this._createPinElement(pin);
            this.pinListElement.appendChild(pinElement);
        });
    };

    _createPinElement(pin) {
        const pinWrapper = document.createElement('div');
        pinWrapper.classList.add('pin-wrapper');

        const pinElement = document.createElement('div');
        pinElement.classList.add('pin', 'action-button');
        pinElement.innerText = `(${pin.tableId}) ${pin.tableName}`;
        pinElement.setAttribute('tableId', pin.tableId);

        const deletePinButton = document.createElement('div');
        deletePinButton.classList.add('delete-pin', 'action-button');
        
        deletePinButton.addEventListener('click', () => {
            pinnedTableService.removePin(pin.tableId);
            pinWrapper.parentNode.removeChild(pinWrapper);
            
            if (this.selectedTableEditor.selectedTable.header.tableId === pin.tableId) {
                this._toggleAddPinButton(pin.tableId);
            }
        });
        
        pinElement.addEventListener('click', () => {
            this.selectedTableEditor.tableSelector.setValue(pin.tableId);
        });

        pinWrapper.appendChild(pinElement);
        pinWrapper.appendChild(deletePinButton);

        return pinWrapper;
    };

    _createAddNewPinButton() {
        const addPinButton = document.createElement('div');
        addPinButton.classList.add('add-new-pin', 'action-button');
        addPinButton.innerText = '+ Add';

        addPinButton.addEventListener('click', () => {
            const selectedTableId = this.selectedTableEditor.selectedTable.header.tableId;
            const selectedTableName = this.selectedTableEditor.selectedTable.header.name;

            const tableAlreadyPinned = pinnedTableService.findPin(selectedTableId);

            if (!tableAlreadyPinned) {
                pinnedTableService.addPin(selectedTableId, selectedTableName);
                this.pinListElement.appendChild(this._createPinElement({'tableId': selectedTableId, 'tableName': selectedTableName}), addPinButton);
                utilService.hide(addPinButton);
            }
        });

        return addPinButton;
    };

    _toggleAddPinButton(tableId) {
        const tableIsPinned = pinnedTableService.findPin(tableId);
        const addNewPinButton = document.querySelector('.add-new-pin');
      
        if (tableIsPinned) {
            utilService.hide(addNewPinButton);
        }
        else {
            utilService.show(addNewPinButton);
        }
    };

    close() {
        ipcRenderer.removeListener('preferencesUpdated', this._onPreferencesUpdated);
        ipcRenderer.removeListener('export-file', this._onExportFile);
        ipcRenderer.removeListener('import-file', this._onImportFile);
        ipcRenderer.removeListener('log-table', this._onLogTable);
        ipcRenderer.removeListener('export-raw-table', this._onExportRawTable);
        ipcRenderer.removeListener('export-frt', this._onExportFrt);
        ipcRenderer.removeListener('import-raw-table', this._onImportRawTable);
        window.removeEventListener('resize', this._windowResizeListener);
        window.removeEventListener('keydown', this._modalCloseListener);
        window.removeEventListener('keydown', this._onKeyOpenJumpToColumnModal);
    };
};

module.exports = TableEditorWrapper;