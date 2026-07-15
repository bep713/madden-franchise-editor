const Selectr = require("../../libs/selectr/selectr");
const { default: Handsontable } = require("handsontable");

const utilService = require("../utilService");
const contextMenuService = require("./contextMenuService");
const referenceViewerService = require("../referenceViewerService");
const preferencesService = require("../preferencesService");

function isDev() {
  return window.electronAPI?.isDev ?? false;
}

class TableEditorView {
  constructor(fileId, container, parent, initialTableToSelect) {
    this.fileId = fileId;
    this.file = null; // No longer holds raw file object
    this.tableList = []; // Cached table list from IPC
    this.baseContainer = document.querySelector(container);
    this.parent = parent;

    this.navSteps = [];
    this.rowIndexToSelect = 0;
    this.tableSelector = null;
    this.selectedTable = null;
    this.columnIndexToSelect = 0;
    this.showHeaderTypes = false;
    this.currentlySelectedRow = 0;
    this.initialTableToSelect = initialTableToSelect;
    this.currentlySelectedColumn = 0;
    this.cellErrors = {};
    this.loader = document.querySelector(".loader-wrapper");
    this.referenceEditorSelector = this.parent.referenceEditorSelector;

    this.hot = new Handsontable(this.baseContainer, {
      // filters: true,
      width: "100%",
      height: "100%",
      rowHeaders: true,
      // dropdownMenu: true,
      manualRowResize: true,
      manualColumnResize: true,
      currentRowClassName: "active-row",
      licenseKey: "non-commercial-and-evaluation",
      afterChange: this._processChanges.bind(this),
      afterSelection: this._processSelection.bind(this),
      cells: this._getCellProperties.bind(this),
      contextMenu: contextMenuService.getContextMenu(this),
      rowHeaders: function (index) {
        return index;
      },
    });

    this._addEventListeners();
    this.initialLoadPromise = this._initialLoad();
  }

  _processSelection(row, col, row2, col2) {
    this.currentlySelectedRow = row;
    this.currentlySelectedColumn = col;
  }

  async _processChanges(changes, source) {
    if (changes && source !== "onEmpty" && source !== "cell-write-revert") {
      // Write each change to the main process via IPC
      for (const change of changes) {
        const recordIndex = this.hot.toPhysicalRow(change[0]);
        const fieldName = change[1];
        const oldValue = change[2];
        const newValue = change[3];

        try {
          // Write to main process via IPC
          const result = await window.franchiseAPI.writeTableCell(
            this.fileId,
            this.selectedTable.tableId,
            recordIndex,
            fieldName,
            newValue,
          );

          if (result?.error) {
            throw new Error(result.error);
          }

          // Update local cache
          if (this.selectedTable.records[recordIndex]) {
            this.selectedTable.records[recordIndex][fieldName] = newValue;
          }
        } catch (err) {
          // Revert the cell on error
          this.hot.setDataAtCell(
            change[0],
            this._getColumnIndex(fieldName),
            oldValue,
            "cell-write-revert",
          );
          console.warn("Failed to write cell value:", err);
        }
      }

      // Auto-save after changes (only if enabled in preferences)
      if (
        this.parent &&
        this.parent.fileId &&
        preferencesService.getValue("general.autoSave")?.[0]
      ) {
        window.franchiseAPI.saveFile(this.parent.fileId);
      }
    }
  }

  _getColumnIndex(fieldName) {
    if (!this.selectedTable.headers) return 0;
    const index = this.selectedTable.headers.findIndex(
      (h) => h.name === fieldName,
    );
    return index !== -1 ? index : 0;
  }

  _addEventListeners() {
    const jumpToColumnModal = document.querySelector(".jump-to-column-modal");
    const underlay = document.querySelector(".underlay");
    const jumpRow = document.querySelector(".jump-row");

    const columnSelect = document.querySelector("#available-columns");
    let columnSelectr = new Selectr(columnSelect, {
      data: null,
    });

    const closeModalButton = document.querySelector(".close-modal");
    closeModalButton.addEventListener("click", () => {
      jumpToColumnModal.classList.add("hidden");
      underlay.classList.add("hidden");
    });

    const goJumpToColumnListener = () => {
      const value = columnSelectr.getValue();
      let index = columnSelectr.data.findIndex((opt) => {
        return opt.value === value;
      });

      if (index === -1) {
        index = 0;
      }

      jumpToColumnModal.classList.add("hidden");
      underlay.classList.add("hidden");

      let row = parseInt(jumpRow.value);

      if (!row || row < 0) {
        row = 0;
      }

      this.navSteps.push({
        tableId: this.selectedTable.tableId,
        recordIndex: row,
        column: index,
      });

      window.removeEventListener("keypress", onEnterJumpToColumn);
      this.hot.selectCell(row, index);
    };

    const onEnterJumpToColumn = (e) => {
      if (e.which === 13) {
        goJumpToColumnListener();
      }
    };

    const jumpToColumnListener = () => {
      jumpRow.value = this.currentlySelectedRow;
      const headers = this._formatHeaders(this.selectedTable);
      const options = headers.map((header) => {
        return {
          value: header,
          text: header,
        };
      });

      columnSelectr.removeAll();
      columnSelectr.add(options);

      setTimeout(() => {
        columnSelect.focus();
      }, 200);

      window.addEventListener("keydown", onEnterJumpToColumn);

      jumpToColumnModal.classList.remove("hidden");
      underlay.classList.remove("hidden");

      setTimeout(() => {
        document.querySelector(".modal .selectr-selected").click();

        setTimeout(() => {
          document.querySelector(".modal .selectr-input")?.focus();
        }, 200);
      }, 50);
    };

    const jumpToColumnButton = document.querySelector(".jump-to-column");
    jumpToColumnButton.addEventListener("click", jumpToColumnListener);

    const goJumpToColumnButton = document.querySelector(
      ".btn-go-jump-to-column",
    );
    goJumpToColumnButton.addEventListener("click", goJumpToColumnListener);

    const backLink = document.querySelector(".back-link");
    backLink.addEventListener("click", async () => {
      if (this.navSteps.length >= 2) {
        this.navSteps.pop();

        const navStep = this.navSteps[this.navSteps.length - 1];

        this.rowIndexToSelect = navStep.recordIndex;
        this.columnIndexToSelect = navStep.column;

        this.navSteps.pop();
        this.tableSelector.setValue(navStep.tableId);

        setTimeout(() => {
          if (this.navSteps.length === 1) {
            backLink.classList.add("disabled");
          }
        }, 200);
      }
    });
  }

  /**
   * Read table data from main process, update selectedTable, and render.
   * @param {number} tableId - The table ID to load.
   * @returns {Promise<Object>} The loaded table data.
   */
  async loadTableById(tableId) {
    const tableData = await window.franchiseAPI.readTableData(
      this.fileId,
      tableId,
    );

    if (tableData?.error) {
      throw new Error(tableData.error);
    }

    this.selectedTable = tableData;
    this.loadTable(tableData);
    return tableData;
  }

  async _initialLoad() {
    try {
      // Fetch table list via IPC
      this.tableList = await window.franchiseAPI.getTableList(this.fileId);

      const tableChoices = this.tableList.map((table, index) => {
        return {
          value: table.id,
          text: `${table.id} - ${table.name}`,
          "data-search-params": [index, table.id, table.name],
        };
      });

      if (tableChoices.length === 0) {
        console.log(
          "cannot load the table editor because the file appears to be corrupt.",
        );
      }

      const tableSelector = document.querySelector(".table-selector");
      this.tableSelector = new Selectr(tableSelector, {
        data: tableChoices,
      });

      const backLink = document.querySelector(".back-link");

      this.tableSelector.on("selectr.change", async (option) => {
        if (isDev()) console.time("change");
        utilService.show(this.loader);

        try {
          const tableId = parseInt(this.tableSelector.getValue(true).value);
          if (isDev()) console.time("read records");
          const tableData = await this.loadTableById(tableId);
          if (isDev()) console.timeEnd("read records");

          this.hot.selectCell(this.rowIndexToSelect, this.columnIndexToSelect);

          this.rowIndexToSelect = 0;
          this.columnIndexToSelect = 0;

          const selectedCell = this.hot.getSelectedLast();
          if (selectedCell) {
            this.navSteps.push({
              tableId: tableData.tableId,
              recordIndex: selectedCell[0],
              column: selectedCell[1],
            });
          }

          if (this.navSteps.length >= 2) {
            backLink.classList.remove("disabled");
          }

          utilService.hide(this.loader);

          this.parent._toggleAddPinButton(tableData.tableId);
          this.parent._onTableChanged(tableData.tableId, tableData.name);

          if (isDev()) console.timeEnd("change");
        } catch (err) {
          console.error("Failed to load table:", err);
          utilService.hide(this.loader);
        }
      });

      if (this.initialTableToSelect) {
        this.rowIndexToSelect = this.initialTableToSelect.recordIndex;
        this.columnIndexToSelect = this.initialTableToSelect.columnIndex;

        this.tableSelector.setValue(this.initialTableToSelect.tableId);
        this.initialTableToSelect = null;
      } else {
        this.tableSelector.setValue(tableChoices[1].value);

        // Load the default table via IPC
        const defaultTableId = tableChoices[1].value;
        this.loadTableById(defaultTableId).catch((err) => {
          console.error("Failed to load default table:", err);
        });
      }
    } catch (err) {
      console.error("Failed to load table list:", err);
    }
  }

  loadTable(table) {
    if (isDev()) console.time("get data");
    this.cellErrors = table.cellErrors || {};
    const data = this._formatTable(table);
    if (isDev()) console.timeEnd("get data");
    const headers = this._formatHeaders(table);
    const columns = this._formatColumns(table);

    // this.hot.loadData(data);
    this.hot.updateSettings({
      data: data,
      colHeaders: headers,
      columns: columns,
      colWidths: this._calculateColumnWidths(columns, table),
    });

    this.hot.selectCell(this.rowIndexToSelect, this.columnIndexToSelect);

    utilService.hide(this.loader);
  }

  _getCellProperties(row, col) {
    if (!this.selectedTable?.headers?.length) {
      return {};
    }

    const physicalRow = this.hot?.toPhysicalRow ? this.hot.toPhysicalRow(row) : row;
    const physicalColumn = this.hot?.toPhysicalColumn
      ? this.hot.toPhysicalColumn(col)
      : col;
    const header = this.selectedTable.headers[physicalColumn];

    if (!header) {
      return {};
    }

    const errorMessage = this._getCellError(physicalRow, header.name);

    if (!errorMessage) {
      return {};
    }

    return {
      className: "table-cell--error",
      readOnly: true,
      editor: false,
      renderer: this._renderErrorCell.bind(this),
      errorMessage,
    };
  }

  _getCellError(recordIndex, fieldName) {
    if (recordIndex === null || recordIndex === undefined || !fieldName) {
      return null;
    }

    return this.cellErrors?.[recordIndex]?.[fieldName] || null;
  }

  _renderErrorCell(instance, td, row, col, prop, value, cellProperties) {
    utilService.removeChildNodes(td);

    td.classList.add("table-cell--error");
    td.title = cellProperties.errorMessage || "";
    td.textContent = value || "Error loading cell";

    return td;
  }

  _formatTable(table) {
    // IPC returns records as array of plain objects { fieldName: value }
    return table.records;
  }

  _formatHeaders(table) {
    if (table.headers) {
      if (this.showHeaderTypes) {
        return table.headers.map((offset) => {
          return `${offset.name} <div class="header-type">${offset.type}</div>`;
        });
      } else {
        return table.headers.map((offset) => {
          return offset.name;
        });
      }
    } else {
      return [];
    }
  }

  _formatColumns(table) {
    if (table.headers) {
      return table.headers.map((offset) => {
        return {
          data: offset.name,
          renderer: getRendererType.bind(this)(offset),
          wordWrap: false,
          editor: offset.enum || offset.type === "bool" ? "dropdown" : "text",
          source: offset.enum
            ? offset.enum.members.map((member) => {
                return member.name;
              })
            : offset.type === "bool"
              ? ["true", "false"]
              : [],
        };
      });
    } else {
      return [];
    }

    function getRendererType(offset) {
      if (offset.isReference) {
        return this.parent.referenceRenderer.renderer.bind(
          this.parent.referenceRenderer,
        );
      } else if (offset.valueInThirdTable) {
        return this.parent.blobRenderer.renderer.bind(this.parent.blobRenderer);
      } else if (offset.enum || offset.type === "bool") {
        return "dropdown";
      } else {
        return "text";
      }
    }
  }

  _calculateColumnWidths(columns, table) {
    return columns.map((col, index) => {
      const offset = table.headers[index];
      const colMinWidth = col.data.length * 9 + 26;
      let calculatedWidth = 0;

      if (offset.isReference || offset.enum) {
        const typeLength = (offset.type.length + 6) * 9 + 35;
        calculatedWidth = typeLength > 350 ? typeLength : 350;
      } else if (offset.valueInThirdTable) {
        calculatedWidth = 700;
      } else if (offset.maxLength) {
        calculatedWidth = offset.maxLength * 9 + 26;
      } else if (offset.type === "bool") {
        calculatedWidth = 80;
      } else {
        calculatedWidth = offset.length * 9 + 26;
      }

      return colMinWidth > calculatedWidth ? colMinWidth : calculatedWidth;
    });
  }

  showReferenceViewer(referencedRecordData, references) {
    referenceViewerService.showReferenceViewer(
      referencedRecordData,
      references,
    );
  }
}

module.exports = TableEditorView;
