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

  async _exportTable(filePath) {
    this.loader.show();

    // Wait for the browser to paint the loader before doing heavy work
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    try {
      ipcRenderer.send("exporting");
      await externalDataService.exportTableData(
        {
          outputFilePath: filePath,
        },
        this.tableEditorWrapper.selectedTableEditor.selectedTable,
      );
      this.loader.hide();
      ipcRenderer.send("exported");

      if (preferencesService.getValue("general.openExcelAfterImport")?.[0]) {
        window.electronAPI.send("open-path", filePath);
      }
    } catch (err) {
      console.error(err);
      ipcRenderer.send("export-error");
      window.electronAPI.showMessageBox({
        type: "error",
        title: "Unable to export",
        message:
          "Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.",
      });
      this.loader.hide();
    }
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

  async _importTable(filePath) {
    this.loader.show();

    // Wait for the browser to paint the loader before doing heavy work
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    try {
      ipcRenderer.send("importing");

      const rows = await externalDataService.importTableData({
        inputFilePath: filePath,
      });

      const table = this.tableEditorWrapper.selectedTableEditor.selectedTable;
      await externalDataService.importTableBulk(
        this.tableEditorWrapper.fileId,
        table.tableId,
        rows,
      );

      await this.tableEditorWrapper.selectedTableEditor.loadTableById(
        table.tableId,
      );
      this.loader.hide();
      ipcRenderer.send("imported");
    } catch (err) {
      console.error(err);
      ipcRenderer.send("import-error");
      window.electronAPI.showMessageBox({
        type: "error",
        title: "Unable to import",
        message: `Unable to import the table. Error: ${err.message || err}`,
      });
      this.loader.hide();
    }
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

  async _exportRawTable(filePath) {
    this.loader.show();

    // Wait for the browser to paint the loader before doing heavy work
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    try {
      ipcRenderer.send("exporting");
      const table = this.tableEditorWrapper.selectedTableEditor.selectedTable;
      await externalDataService.exportRawTableData(
        {
          outputFilePath: filePath,
        },
        this.tableEditorWrapper.fileId,
        table.tableId,
      );
      this.loader.hide();
      ipcRenderer.send("exported");
    } catch (err) {
      console.error(err);
      ipcRenderer.send("export-error");
      window.electronAPI.showMessageBox({
        type: "error",
        title: "Unable to export",
        message: `Unable to export. Error: ${err.message || err}`,
      });
      this.loader.hide();
    }
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

  async _exportRawFrtk(filePath) {
    this.loader.show();

    // Wait for the browser to paint the loader before doing heavy work
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    try {
      ipcRenderer.send("exporting");
      await externalDataService.exportFrt(
        {
          outputFilePath: filePath,
        },
        this.tableEditorWrapper.fileId,
      );
      this.loader.hide();
      ipcRenderer.send("exported");
    } catch (err) {
      console.error(err);
      ipcRenderer.send("export-error");
      window.electronAPI.showMessageBox({
        type: "error",
        title: "Unable to export",
        message: `Error while exporting FRTK file: ${err.message || err}`,
      });
      this.loader.hide();
    }
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

  async _importRawTable(filePath) {
    this.loader.show();

    // Wait for the browser to paint the loader before doing heavy work
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    try {
      ipcRenderer.send("importing");

      const table = this.tableEditorWrapper.selectedTableEditor.selectedTable;
      await externalDataService.importRawTable(
        {
          filePath: filePath,
        },
        this.tableEditorWrapper.fileId,
        table.tableId,
      );
      this.tableEditorWrapper.selectedTableEditor.loadTable(
        this.tableEditorWrapper.selectedTableEditor.selectedTable,
      );
      this.loader.hide();
      ipcRenderer.send("imported");
    } catch (err) {
      console.error(err);
      ipcRenderer.send("import-error");
      window.electronAPI.showMessageBox({
        type: "error",
        title: "Unable to import",
        message: `Unable to import the raw table. Error: ${err.message || err}`,
      });
      this.loader.hide();
    }
  }
}

module.exports = ExternalDataHandler;
