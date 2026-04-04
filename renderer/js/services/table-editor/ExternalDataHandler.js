const { ipcRenderer } = require("electron");

const Loader = require("./Loader");
const externalDataService = require("../externalDataService");
const preferencesService = require("../preferencesService");

class ExternalDataHandler {
  constructor(tableEditorWrapper) {
    this.loader = new Loader();
    this.tableEditorWrapper = tableEditorWrapper;
  }

  async exportTable() {
    let result = await window.electronAPI.showSaveDialog({
      title: "Select destination file for table export",
      filters: [
        { name: "Excel workbook", extensions: ["xlsx"] },
        { name: "CSV (comma-delimited)", extensions: ["csv"] },
        { name: "Excel Macro-Enabled Workbook", extensions: ["xlsm"] },
        { name: "Excel Binary Workbook", extensions: ["xlsb"] },
        { name: "Excel 97-2003 Workbook", extensions: ["xls"] },
        { name: "OpenDocument Spreadsheet", extensions: ["ods"] },
        { name: "UTF-16 Unicode Text", extensions: ["txt"] },
      ],
    });

    let filePath = result.filePath;
    if (filePath) {
      this._exportTable(filePath);
    }
  }

  _exportTable(filePath) {
    this.loader.show();

    setTimeout(() => {
      ipcRenderer.send("exporting");
      externalDataService
        .exportTableData(
          {
            outputFilePath: filePath,
          },
          this.tableEditorWrapper.selectedTableEditor.selectedTable,
        )
        .then(() => {
          this.loader.hide();
          ipcRenderer.send("exported");

          if (
            preferencesService.getValue("general.openExcelAfterImport")?.[0]
          ) {
            window.electronAPI.send("open-path", filePath);
          }
        })
        .catch((err) => {
          console.error(err);
          ipcRenderer.send("export-error");
          window.electronAPI.showMessageBox({
            type: "error",
            title: "Unable to export",
            message:
              "Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.",
          });
          this.loader.hide();
        });
    }, 10);
  }

  async importTable() {
    let result = await window.electronAPI.showOpenDialog({
      title: "Select file for table import",
      filters: [
        { name: "Excel workbook", extensions: ["xlsx"] },
        { name: "CSV (comma-delimited)", extensions: ["csv"] },
        { name: "Excel Macro-Enabled Workbook", extensions: ["xlsm"] },
        { name: "Excel Binary Workbook", extensions: ["xlsb"] },
        { name: "Excel 97-2003 Workbook", extensions: ["xls"] },
        { name: "OpenDocument Spreadsheet", extensions: ["ods"] },
        { name: "UTF-16 Unicode Text", extensions: ["txt"] },
      ],
    });

    let filePath = result.filePaths;
    if (filePath && filePath.length > 0) {
      this._importTable(filePath[0]);
    }
  }

  _importTable(filePath) {
    this.loader.show();

    setTimeout(() => {
      ipcRenderer.send("importing");
      externalDataService
        .importTableData({
          inputFilePath: filePath,
        })
        .then((table) => {
          const flipSaveOnChange =
            this.tableEditorWrapper.file.settings.saveOnChange;
          this.tableEditorWrapper.file.settings.saveOnChange = false;

          // do not allow rows to be added.
          const trimmedTable = table.slice(
            0,
            this.tableEditorWrapper.selectedTableEditor.selectedTable.records
              .length,
          );
          trimmedTable.forEach((record, index) => {
            let franchiseRecord =
              this.tableEditorWrapper.selectedTableEditor.selectedTable.records[
                index
              ];

            Object.keys(record).forEach((key) => {
              if (franchiseRecord[key] !== record[key]) {
                franchiseRecord[key] = record[key];
              }
            });
          });

          this.tableEditorWrapper.selectedTableEditor.selectedTable.recalculateEmptyRecordReferences();

          ipcRenderer.send("imported");

          if (flipSaveOnChange) {
            this.tableEditorWrapper.file.save();
            this.tableEditorWrapper.file.settings.saveOnChange = true;
          }

          this.tableEditorWrapper.selectedTableEditor.loadTable(
            this.tableEditorWrapper.selectedTableEditor.selectedTable,
          );
        });
    }, 10);
  }

  async exportRawTable() {
    let result = await window.electronAPI.showSaveDialog({
      title: "Select destination file for raw table export",
      filters: [{ name: "DAT file", extensions: ["dat"] }],
    });

    let filePath = result.filePath;
    if (filePath) {
      this._exportRawTable(filePath);
    }
  }

  _exportRawTable(filePath) {
    this.loader.show();

    setTimeout(() => {
      ipcRenderer.send("exporting");
      const table = this.tableEditorWrapper.selectedTableEditor.selectedTable;
      externalDataService
        .exportRawTableData(
          {
            outputFilePath: filePath,
          },
          this.tableEditorWrapper.fileId,
          table.tableId,
        )
        .then(() => {
          this.loader.hide();
          ipcRenderer.send("exported");
        })
        .catch((err) => {
          console.error(err);
          ipcRenderer.send("export-error");
          window.electronAPI.showMessageBox({
            type: "error",
            title: "Unable to export",
            message: `Unable to export. Error: ${err.message || err}`,
          });
          this.loader.hide();
        });
    }, 10);
  }

  async exportRawFrtk() {
    let result = await window.electronAPI.showSaveDialog({
      title: "Select destination file for raw FRT file export",
      filters: [{ name: "FRT file", extensions: ["frt"] }],
    });

    let filePath = result.filePath;
    if (filePath) {
      this._exportRawFrtk(filePath);
    }
  }

  _exportRawFrtk(filePath) {
    this.loader.show();

    setTimeout(() => {
      ipcRenderer.send("exporting");
      externalDataService
        .exportFrt(
          {
            outputFilePath: filePath,
          },
          this.tableEditorWrapper.fileId,
        )
        .then(() => {
          this.loader.hide();
          ipcRenderer.send("exported");
        })
        .catch((err) => {
          console.error(err);
          ipcRenderer.send("export-error");
          window.electronAPI.showMessageBox({
            type: "error",
            title: "Unable to export",
            message: `Error while exporting FRTK file: ${err.message || err}`,
          });
          this.loader.hide();
        });
    }, 10);
  }

  async importRawTable() {
    let result = await window.electronAPI.showOpenDialog({
      title: "Select the file to import",
      filters: [{ name: "DAT file", extensions: ["dat", "*"] }],
    });

    let filePath = result.filePaths;
    if (filePath && filePath.length > 0) {
      this._importRawTable(filePath[0]);
    }
  }

  _importRawTable(filePath) {
    this.loader.show();

    setTimeout(() => {
      ipcRenderer.send("importing");

      const table = this.tableEditorWrapper.selectedTableEditor.selectedTable;
      externalDataService
        .importRawTable(
          {
            filePath: filePath,
          },
          this.tableEditorWrapper.fileId,
          table.tableId,
        )
        .then(() => {
          this.tableEditorWrapper.selectedTableEditor.loadTable(
            this.tableEditorWrapper.selectedTableEditor.selectedTable,
          );
          this.loader.hide();
          ipcRenderer.send("imported");
        })
        .catch((err) => {
          console.error(err);
          ipcRenderer.send("import-error");
          window.electronAPI.showMessageBox({
            type: "error",
            title: "Unable to import",
            message: `Unable to import the raw table. Error: ${err.message || err}`,
          });
          this.loader.hide();
        });
    }, 10);
  }
}

module.exports = ExternalDataHandler;
