const EventEmitter = require("events");
const { ipcRenderer } = require("electron");

const utilService = require("../utilService");
const perfService = require("../perfService");
const TableEditorView = require("./TableEditorView");
const pinnedTableService = require("../pinnedTableService");
const ExternalDataHandler = require("./ExternalDataHandler");
const externalDataService = require("../externalDataService");
const referenceViewerService = require("../referenceViewerService");
const preferencesService = require("../preferencesService");

const ReferenceEditor = require("./custom-renderers/reference/ReferenceEditor");
const ReferenceRenderer = require("./custom-renderers/reference/ReferenceRenderer");

const BinaryBlobEditor = require("./custom-renderers/binary-blob/BinaryBlobEditor");
const BinaryBlobRenderer = require("./custom-renderers/binary-blob/BinaryBlobRenderer");

class TableEditorWrapper {
  constructor() {
    this.name = "tableEditorService"; // for legacy purposes in nav data
    this.eventEmitter = new EventEmitter();
    this.initialTableToSelect = null;
    this.lastSelectedCell = {
      row: 0,
      column: 0,
    };

    this.externalDataHandler = new ExternalDataHandler(this);
    this.referenceEditor = new ReferenceEditor(this);
    this.referenceRenderer = new ReferenceRenderer(this);

    this.blobEditor = new BinaryBlobEditor(this);
    this.blobRenderer = new BinaryBlobRenderer(this);
  }

  async start(fileId, navSteps) {
    // Make sure a previous start can't leak views or listeners
    this._teardown();
    const startId = this._startId;

    this.fileId = fileId;
    this.initialNavSteps = navSteps;
    this.file = null; // No longer holds raw file object
    this.tableEditors = [];
    this.pinListElement = null;
    this.selectedTableEditor = null;
    this.loader = document.querySelector(".loader-wrapper");
    perfService.mark("open:te-start");

    this._addIpcListeners();
    this._addEventListeners();

    // Get file metadata via IPC
    const metadata = await window.franchiseAPI.getMetadata(fileId);
    this.fileMetadata = metadata;
    perfService.mark("open:te-metadata");

    // Closed or restarted while waiting on metadata
    if (startId !== this._startId) return;

    await this.onReady();
  }

  async onReady() {
    const prefs = preferencesService.get();
    this._setFilePrefs(prefs);

    this.selectedTableEditor = new TableEditorView(
      this.fileId,
      ".table-content-wrapper",
      this,
      this.initialTableToSelect,
    );
    if (this.initialNavSteps) {
      this.selectedTableEditor.navSteps = this.initialNavSteps;
      this.initialNavSteps = null;
    }
    this.tableEditors.push(this.selectedTableEditor);

    this._initializeEditors();
    await this._initializePins(
      this.fileMetadata?.gameYear,
      this.fileMetadata?.type?.gameType,
    );
    this._windowResizeListener();
    this._selectionListener();

    this.initialTableToSelect = null;
    if (perfService.enabled) {
      // measure until the table list and table picker exist too
      await this.selectedTableEditor.initialLoadPromise?.catch(() => {});
    }
    perfService.mark("open:te-ready");
    perfService.openInteractive();
  }

  _setFilePrefs(prefs) {
    // File preferences are now managed in the main process
    // This method is kept for compatibility
  }

  _addIpcListeners() {
    this._ipcListeners = [
      {
        event: "preferencesUpdated",
        ref: this._onPreferencesUpdated.bind(this),
      },
      {
        event: "export-file",
        ref: this._onExportFile.bind(this),
      },
      {
        event: "import-file",
        ref: this._onImportFile.bind(this),
      },
      {
        event: "log-table",
        ref: this._onLogTable.bind(this),
      },
      {
        event: "copy-unique-id",
        ref: this._onCopyUniqueId.bind(this),
      },
      {
        event: "export-raw-table",
        ref: this._onExportRawTable.bind(this),
      },
      {
        event: "export-frt",
        ref: this._onExportFrt.bind(this),
      },
      {
        event: "import-raw-table",
        ref: this._onImportRawTable.bind(this),
      },
    ];

    this._ipcListeners.forEach((listener) => {
      ipcRenderer.on(listener.event, listener.ref);
    });
  }

  _onPreferencesUpdated(e, preferences) {
    this._setFilePrefs(preferences);
  }

  _onExportFile() {
    this.externalDataHandler.exportTable();
  }

  _onImportFile() {
    this.externalDataHandler.importTable();
  }

  _onLogTable() {
    console.log(this.selectedTableEditor.selectedTable);
  }

  _onCopyUniqueId() {
    const uniqueId = this.selectedTableEditor.selectedTable.header.uniqueId;
    if (uniqueId) {
      navigator.clipboard.writeText(uniqueId).then(() => {
        console.log(`Copied Unique ID: ${uniqueId}`);
      }).catch((err) => {
        console.error('Failed to copy Unique ID: ', err);
      });
    } else {
      console.warn('No Unique ID found for the selected table.');
    }
  }

  _onExportRawTable() {
    this.externalDataHandler.exportRawTable();
  }

  _onExportFrt() {
    this.externalDataHandler.exportRawFrtk();
  }

  _onImportRawTable() {
    this.externalDataHandler.importRawTable();
  }

  _addEventListeners() {
    this._referenceListeners = [
      {
        event: "reference-clicked",
        ref: this._onReferenceClicked.bind(this),
      },
    ];

    this._referenceListeners.forEach((listener) => {
      referenceViewerService.eventEmitter.on(listener.event, listener.ref);
    });

    this._windowListeners = [
      {
        event: "resize",
        ref: this._windowResizeListener.bind(this),
      },
      {
        event: "keydown",
        ref: this._modalCloseListener.bind(this),
      },
      {
        event: "keydown",
        ref: this._onKeyOpenJumpToColumnModal.bind(this),
      },
    ];

    this._windowListeners.forEach((listener) => {
      window.addEventListener(listener.event, listener.ref);
    });
  }

  _onReferenceClicked(event) {
    const referenceData = event.reference;

    if (event.newTab) {
      this._openTableInNewTab(referenceData.tableId, 0);
    } else {
      this.selectedTableEditor.tableSelector.setValue(referenceData.tableId);
    }
  }

  _windowResizeListener() {
    const tableWrapper = document.querySelector(".table-wrapper");
    const tableEditorWrapper = document.querySelector(".table-editor-wrapper");

    if (
      tableWrapper &&
      tableEditorWrapper &&
      this.selectedTableEditor &&
      this.selectedTableEditor.hot
    ) {
      this.selectedTableEditor.hot.updateSettings({
        height: tableEditorWrapper.offsetHeight - 113,
        width: tableWrapper.offsetWidth,
      });
    }
  }

  _modalCloseListener(e) {
    if (e.which === 27) {
      const modalsToHide = document.querySelectorAll(".modal:not(.hidden)");
      modalsToHide.forEach((modal) => {
        modal.classList.add("hidden");
      });

      const underlay = document.querySelector(".underlay");
      underlay.classList.add("hidden");

      this.selectedTableEditor.hot.selectCell(
        this.selectedTableEditor.currentlySelectedRow,
        this.selectedTableEditor.currentlySelectedColumn,
      );
    }
  }

  _onKeyOpenJumpToColumnModal(e) {
    if (e.which === 74 && e.ctrlKey) {
      this.selectedTableEditor.hot.deselectCell();
      document.querySelector(".jump-to-column").click();
    }
  }

  _initializeEditors() {
    this._initializeReferenceEditor();
    this._initializeBlobEditor();
  }

  async _initializeReferenceEditor() {
    await this.selectedTableEditor.initialLoadPromise;
    this.referenceEditor.initialize();
  }

  _initializeBlobEditor() {
    this.blobEditor.initialize();
  }

  async _initializePins(gameYear, gameType) {
    // Pins are matched against the file's table list, so wait for it to load
    await this.selectedTableEditor.initialLoadPromise;
    await pinnedTableService.initialize(
      gameYear,
      this.selectedTableEditor.tableList,
      gameType,
    );

    this.pinListElement = document.querySelector(".pins-list");
    utilService.removeChildNodes(this.pinListElement);
    this.pinListElement.appendChild(this._createAddNewPinButton());

    if (pinnedTableService.applicablePins) {
      pinnedTableService.applicablePins.forEach((pin) => {
        const pinElement = this._createPinElement(pin);
        this.pinListElement.appendChild(pinElement);
      });
    }

    const selectedTable = this.selectedTableEditor?.selectedTable;
    if (selectedTable) {
      this._toggleAddPinButton(selectedTable);
    }
  }

  _createPinElement(pin) {
    const resolvedTable = pinnedTableService.resolvePin(pin);
    const tableId = resolvedTable ? resolvedTable.id : pin.tableId;

    const pinWrapper = document.createElement("div");
    pinWrapper.classList.add("pin-wrapper");

    const pinElement = document.createElement("div");
    pinElement.classList.add("pin", "action-button");
    pinElement.innerText = `(${tableId}) ${pin.tableName}`;
    pinElement.setAttribute("tableId", tableId);
    if (pin.uniqueId) {
      pinElement.setAttribute("uniqueId", pin.uniqueId);
    }

    if (!resolvedTable) {
      pinElement.classList.add("pin--unavailable");
      pinElement.title = "Table not found in this file";
    }

    const deletePinButton = document.createElement("div");
    deletePinButton.classList.add("delete-pin", "action-button");

    deletePinButton.addEventListener("click", () => {
      pinnedTableService.removePin(pin);
      pinWrapper.parentNode.removeChild(pinWrapper);

      const selectedTable = this.selectedTableEditor.selectedTable;
      if (pinnedTableService.pinMatches(pin, selectedTable)) {
        this._toggleAddPinButton(selectedTable);
      }
    });

    pinElement.addEventListener("click", () => {
      if (!resolvedTable) return;
      this.selectedTableEditor.tableSelector.setValue(resolvedTable.id);
    });

    pinWrapper.appendChild(pinElement);
    pinWrapper.appendChild(deletePinButton);

    return pinWrapper;
  }

  _createAddNewPinButton() {
    const addPinButton = document.createElement("div");
    addPinButton.classList.add("add-new-pin", "action-button");
    addPinButton.innerText = "+ Add";

    addPinButton.addEventListener("click", () => {
      const selectedTable = this.selectedTableEditor.selectedTable;
      const tableAlreadyPinned = pinnedTableService.findPin(selectedTable);

      if (!tableAlreadyPinned) {
        pinnedTableService.addPin({
          uniqueId: selectedTable.uniqueId,
          tableId: selectedTable.tableId,
          tableName: selectedTable.name,
        });

        // addPin stores the new pin last
        const newPin =
          pinnedTableService.applicablePins[
            pinnedTableService.applicablePins.length - 1
          ];
        this.pinListElement.appendChild(this._createPinElement(newPin));
        utilService.hide(addPinButton);
      }
    });

    return addPinButton;
  }

  /**
   * @param {{tableId: number, uniqueId?: number}} table
   */
  _toggleAddPinButton(table) {
    const tableIsPinned = pinnedTableService.findPin(table);
    const addNewPinButton = document.querySelector(".add-new-pin");

    // The pins list may not be built yet when the first table finishes loading
    if (!addNewPinButton) return;

    if (tableIsPinned) {
      utilService.hide(addNewPinButton);
    } else {
      utilService.show(addNewPinButton);
    }
  }

  _onTableChanged(tableId, name) {
    this.eventEmitter.emit("table-changed", {
      tableId,
      name,
    });
  }

  _openTableInNewTab(tableId, row) {
    this.initialTableToSelect = {
      tableId: tableId,
      recordIndex: row,
      columnIndex: 0,
    };

    this.eventEmitter.emit("table-editor:new-tab", {
      tableId,
      row,
    });
  }

  _selectionListener() {
    this.selectedTableEditor.hot.addHook(
      "afterSelection",
      (row, col, row2, col2) => {
        this.lastSelectedCell.row = row2;
        this.lastSelectedCell.column = col2;
      },
    );
  }

  onClose() {
    this._teardown();
  }

  // Idempotent. Safe to call when start() never ran.
  _teardown() {
    this._startId = (this._startId || 0) + 1;

    (this._ipcListeners || []).forEach((listener) => {
      ipcRenderer.removeListener(listener.event, listener.ref);
    });
    this._ipcListeners = [];

    (this._windowListeners || []).forEach((listener) => {
      window.removeEventListener(listener.event, listener.ref);
    });
    this._windowListeners = [];

    (this._referenceListeners || []).forEach((listener) => {
      referenceViewerService.eventEmitter.off(listener.event, listener.ref);
    });
    this._referenceListeners = [];

    (this.tableEditors || []).forEach((view) => {
      try {
        view.destroy();
      } catch (err) {
        console.error("Failed to destroy table editor view:", err);
      }
    });
    this.tableEditors = [];
    this.selectedTableEditor = null;
  }
}

module.exports = TableEditorWrapper;
