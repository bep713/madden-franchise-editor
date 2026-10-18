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
    this.emptyRecordIndices = new Set();
    this.loader = document.querySelector(".loader-wrapper");
    this.referenceEditorSelector = this.parent.referenceEditorSelector;

    this.isDestroyed = false;
    this.columnSelector = null;

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
      beforeChange: this._beforeChange.bind(this),
      cells: this._getCellProperties.bind(this),
      contextMenu: contextMenuService.getContextMenu(this),
      rowHeaders: function (index) {
        return index;
      },
    });

    this._addEventListeners();
    this.initialLoadPromise = this._initialLoad();
  }

  _beforeChange(changes, source) {
    if (!changes) {
      return;
    }

    // Drop changes where the old value is the same as the new value.
    // Handsontable skips any entry set to null.
    let remaining = 0;
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      if (!change) continue;
      if (change[2] === change[3]) {
        changes[i] = null;
      } else {
        remaining++;
      }
    }

    // If no changes remain after filtering, cancel the operation
    if (remaining === 0) {
      return false; // Returning false cancels the changes
    }
  }

  _processSelection(row, col, row2, col2) {
    this.currentlySelectedRow = row;
    this.currentlySelectedColumn = col;
  }

  async _processChanges(changes, source) {
    if (
      !changes ||
      source === "onEmpty" ||
      source === "cell-write-revert" ||
      source === "loadData"
    ) {
      return;
    }

    // afterChange may still receive no-op changes, so filter again
    const changesToSend = changes.filter((c) => c && c[2] !== c[3]);
    if (changesToSend.length === 0) {
      return;
    }

    const showLoader = changesToSend.length > 1;
    if (showLoader) {
      utilService.show(this.loader);
      // give the browser a frame to paint the loader before the (potentially long) IPC
      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(resolve, 0)),
      );
    }

    const tableId = this.selectedTable.tableId;
    let response;
    try {
      response = await window.franchiseAPI.writeBulkTableCells(
        this.fileId,
        changesToSend.map((change) => ({
          tableId,
          recordIndex: this.hot.toPhysicalRow(change[0]),
          fieldName: change[1],
          value: change[3],
        })),
      );
    } catch (err) {
      response = { success: false, error: err?.message || String(err) };
    }

    try {
      if (!response?.success) {
        console.warn("Failed to write cells:", response?.error);
        this._revertChanges(changesToSend);
        return;
      }

      // 1. Revert only the cells that failed
      const failedResults = (response.results || []).filter((r) => !r.success);
      if (failedResults.length) {
        console.warn("Failed to write some cells:", failedResults);
        this._revertChanges(failedResults.map((r) => changesToSend[r.index]));
      }

      // 2. Apply per-row updates (one per unique row)
      const sourceEdits = [];
      const unemptiedRows = [];
      for (const row of response.records || []) {
        if (row.tableId !== tableId) continue; // the user switched tables while waiting

        const { recordIndex } = row;
        if (this.selectedTable.records[recordIndex]) {
          // mutate in place so Handsontable's source row object stays the same reference
          Object.assign(this.selectedTable.records[recordIndex], row.record);
        }

        this.selectedTable.recordMeta = this.selectedTable.recordMeta || [];
        this.selectedTable.recordMeta[recordIndex] = row.recordMeta;

        if (row.cellErrors) {
          this.cellErrors[recordIndex] = row.cellErrors;
        } else {
          delete this.cellErrors[recordIndex];
        }

        if (row.previousRecordMeta?.isEmpty && !row.recordMeta?.isEmpty) {
          unemptiedRows.push(recordIndex);
          sourceEdits.push(...(this._getBulkRowEdits(recordIndex, row.record) || []));
        }
      }

      // 3. Empty-record state (once)
      const emptyState = (response.emptyStates || []).find(
        (e) => e.tableId === tableId,
      );
      if (emptyState) {
        this.selectedTable.emptyRecordIndices = emptyState.emptyRecordIndices;
        this.emptyRecordIndices = new Set(emptyState.emptyRecordIndices);
        for (const { index, record } of emptyState.emptyRecords || []) {
          sourceEdits.push(...this._getEmptyRecordRowEdits(index, record));
        }
      }

      // Clear any stale empty class name left in cell meta on un-emptied rows
      if (unemptiedRows.length) {
        const columnCount = this.selectedTable.headers.length;
        this.hot.batch(() => {
          for (const recordIndex of unemptiedRows) {
            const visualRow = this.hot.toVisualRow(recordIndex);
            if (visualRow === null) continue;
            for (let col = 0; col < columnCount; col++) {
              this.hot.setCellMeta(visualRow, col, "className", "");
            }
          }
        });
      }

      if (sourceEdits.length) {
        this.hot.setSourceDataAtCell(sourceEdits, "onEmpty"); // physical indices
      }
      this.hot.render(); // exactly one render
    } finally {
      if (showLoader) {
        utilService.hide(this.loader);
      }
    }
  }

  _revertChanges(changes) {
    this.hot.setDataAtCell(
      changes.map((change) => [
        change[0],
        this._getColumnIndex(change[1]),
        change[2],
      ]),
      "cell-write-revert",
    );
  }

  syncEmptyRecords(emptyRecords) {
    this.emptyRecordIndices = new Set();
    const bulkUpdates = [];

    (emptyRecords || []).forEach(({ index, record }) => {
      this.emptyRecordIndices.add(index);
      bulkUpdates.push(this._getEmptyRecordRowEdits(index, record));
    });

    console.time("set source data");
    this.hot.setSourceDataAtCell(bulkUpdates.flat(), "onEmpty");
    console.timeEnd("set source data");
    this.hot.render();
  }

  syncVisibleRowFromRecord(visualRow, rowData) {
    this.hot.setDataAtRowProp(
      this._getBulkRowEdits(visualRow, rowData),
      "onEmpty",
    );
  }

  syncPhysicalRowFromRecord(physicalRowIndex, record) {
    this.hot.setSourceDataAtCell(
      this._getBulkRowEdits(physicalRowIndex, record),
      "onEmpty",
    );
  }

  _getBulkRowEdits(rowIndex, record) {
    if (!this.selectedTable?.headers?.length || !record) {
      return;
    }

    const rowUpdates = this.selectedTable.headers.map((header) => [
      rowIndex,
      header.name,
      record[header.name],
    ]);

    return rowUpdates;
  }

  _getEmptyRecordRowEdits(rowIndex, record) {
    // Setting a record to empty will only impact the first 4 bytes
    const changedFieldsInFirst4Bytes = this.selectedTable.headers.filter(
      (header) => header.offset < 32,
    );

    const rowUpdates = (changedFieldsInFirst4Bytes || []).map((header) => [
      rowIndex,
      header.name,
      record[header.name],
    ]);

    return rowUpdates;
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
    // Never wrap the same <select> twice
    columnSelect?.selectr?.destroy();
    let columnSelectr = new Selectr(columnSelect, {
      data: null,
    });
    this.columnSelector = columnSelectr;

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

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;

    try {
      if (this.hot && !this.hot.isDestroyed) {
        this.hot.destroy();
      }
    } catch (err) {
      console.error("Failed to destroy Handsontable:", err);
    }

    [this.tableSelector, this.columnSelector].forEach((selector) => {
      try {
        selector?.destroy();
      } catch (err) {
        console.error("Failed to destroy Selectr:", err);
      }
    });
    this.tableSelector = null;
    this.columnSelector = null;
  }

  async _initialLoad() {
    try {
      // Fetch table list via IPC
      this.tableList = await window.franchiseAPI.getTableList(this.fileId);

      // The view was torn down while the table list was loading
      if (this.isDestroyed) return;

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
      // Never wrap the same <select> twice (would render two dropdowns)
      tableSelector.selectr?.destroy();
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

          this.parent._toggleAddPinButton(tableData);
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
    this.emptyRecordIndices = new Set(table.emptyRecordIndices || []);
    const data = this._formatTable(table);
    if (isDev()) console.timeEnd("get data");
    const headers = this._formatHeaders(table);
    const columns = this._formatColumns(table);

    this.hot.loadData(data);
    this.hot.updateSettings({
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

    const physicalRow = this.hot?.toPhysicalRow
      ? this.hot.toPhysicalRow(row)
      : row;
    const physicalColumn = this.hot?.toPhysicalColumn
      ? this.hot.toPhysicalColumn(col)
      : col;
    const header = this.selectedTable.headers[physicalColumn];

    if (!header) {
      return {};
    }

    const errorMessage = this._getCellError(physicalRow, header.name);

    if (errorMessage) {
      return {
        className: "table-cell--error",
        readOnly: true,
        editor: false,
        renderer: this._renderErrorCell.bind(this),
        errorMessage,
      };
    }

    const isCellEmpty = this.emptyRecordIndices.has(physicalRow);
    if (isCellEmpty) {
      return {
        className: "table-cell--empty",
      };
    }

    return {};
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
