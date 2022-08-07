const EventEmitter = require('events');
const { ipcRenderer } = require('electron');

const utilService = require('../utilService');
const TableEditorView = require('./TableEditorView');
const ReferenceEditor = require('./ReferenceEditor');
const ReferenceRenderer = require('./ReferenceRenderer');
const pinnedTableService = require('../pinnedTableService');
const ExternalDataHandler = require('./ExternalDataHandler');
const externalDataService = require('../externalDataService');
const referenceViewerService = require('../referenceViewerService');

class TableEditorWrapper {
    constructor() {
        this.name = 'tableEditorService';   // for legacy purposes in nav data
        this.eventEmitter = new EventEmitter();
        this.initialTableToSelect = null;
        this.lastSelectedCell = {
            row: 0,
            column: 0
        };

        this.externalDataHandler = new ExternalDataHandler(this);
        this.referenceEditor = new ReferenceEditor(this);
        this.referenceRenderer = new ReferenceRenderer(this);
    };

    start(file) {
        this.file = file;
        this.tableEditors = [];
        this.pinListElement = null;
        this.selectedTableEditor = null;
        this.loader = document.querySelector('.loader-wrapper');

        this._addIpcListeners();
        this._addEventListeners();

        if (file.isLoaded) {
            this.onReady();
        } else {
            file.on('ready', function () {
                this.onReady();
            });
        }
    }

    onReady() {
        this.file.settings = {
            'saveOnChange': ipcRenderer.sendSync('getPreferences').general.autoSave[0]
        };

        this.selectedTableEditor = new TableEditorView(this.file, '.table-content-wrapper', this, this.initialTableToSelect);
        this.tableEditors.push(this.selectedTableEditor);

        this._initializeReferenceEditor();
        this._initializePins(this.file.gameYear);
        this._windowResizeListener();
        this._selectionListener();

        this.initialTableToSelect = null;
    };

    _addIpcListeners() {
        this._ipcListeners = [{
            event: 'preferencesUpdated',
            ref: this._onPreferencesUpdated.bind(this)
        }, {
            event: 'export-file',
            ref: this._onExportFile.bind(this)
        }, {
            event: 'import-file',
            ref: this._onImportFile.bind(this)
        }, {
            event: 'log-table',
            ref: this._onLogTable.bind(this)
        }, {
            event: 'export-raw-table',
            ref: this._onExportRawTable.bind(this)
        }, {
            event: 'export-frt',
            ref: this._onExportFrt.bind(this)
        }, {
            event: 'import-raw-table',
            ref: this._onImportRawTable.bind(this)
        }];

        this._ipcListeners.forEach((listener) => {
            ipcRenderer.on(listener.event, listener.ref);
        });
    };

    _onPreferencesUpdated(e, preferences) {
        if (this.file) {
            this.file.settings = {
                'saveOnChange': preferences.general.autoSave[0]
            };
        }
    };

    _onExportFile() {
        this.externalDataHandler.exportTable();
    };
    
    _onImportFile() {
        this.externalDataHandler.importTable();
    };

    _onLogTable() {
        console.log(this.selectedTableEditor.selectedTable);
    };

    _onExportRawTable() {
        this.externalDataHandler.exportRawTable();
    };

    _onExportFrt() {
        this.externalDataHandler.exportRawFrtk();
    };

    _onImportRawTable() {
        this.externalDataHandler.importRawTable();
    };

    _addEventListeners() {
        referenceViewerService.eventEmitter.on('reference-clicked', (event) => {
            const referenceData = event.reference;

            if (event.newTab) {
                this._openTableInNewTab(referenceData.tableId, 0);
            }
            else {
                this.selectedTableEditor.tableSelector.setValue(referenceData.tableId);
            }
        });

        this._windowListeners = [{
            event: 'resize',
            ref: this._windowResizeListener.bind(this)
        }, {
           event: 'keydown',
           ref: this._modalCloseListener.bind(this)
        }, {
            event: 'keydown',
            ref: this._onKeyOpenJumpToColumnModal.bind(this)
        }];

        this._windowListeners.forEach((listener) => {
            window.addEventListener(listener.event, listener.ref);
        });
    };

    _windowResizeListener () {
        const tableWrapper = document.querySelector('.table-wrapper');
        const tableEditorWrapper = document.querySelector('.table-editor-wrapper');

        if (tableWrapper && tableEditorWrapper && this.selectedTableEditor && this.selectedTableEditor.hot) {
            this.selectedTableEditor.hot.updateSettings({
                height: tableEditorWrapper.offsetHeight - 113,
                width: tableWrapper.offsetWidth
            });
        }
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
        this.referenceEditor.initialize();
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

    _onTableChanged(tableId, name) {
        this.eventEmitter.emit('table-changed', {
            tableId,
            name
        });
    };

    _openTableInNewTab(tableId, row) {
        this.initialTableToSelect = {
            tableId: tableId,
            recordIndex: row,
            columnIndex: 0
        };

        this.eventEmitter.emit('table-editor:new-tab', {
            tableId,
            row
        });
    };

    _selectionListener() {
        this.selectedTableEditor.hot.addHook('afterSelection', (row, col, row2, col2) => {
            this.lastSelectedCell.row = row2;
            this.lastSelectedCell.column = col2;
        });
    };

    onClose() {
        this._ipcListeners.forEach((listener) => {
            ipcRenderer.removeListener(listener.event, listener.ref);
        });

        this._windowListeners.forEach((listener) => {
            window.removeEventListener(listener.event, listener.ref);
        });
    };
};

module.exports = TableEditorWrapper;