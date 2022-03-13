const { ipcRenderer } = require('electron');
const { dialog, shell, getCurrentWindow } = require('@electron/remote');

const Loader = require('./Loader');
const externalDataService = require('../externalDataService');

class ExportHandler {
    constructor(tableEditorWrapper) {
        this.loader = new Loader();
        this.tableEditorWrapper = tableEditorWrapper;
    };

    exportTable() {
        let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
            'title': 'Select destination file for table export',
            'filters':  [
            { name: 'Excel workbook', extensions: ['xlsx'] },
            { name: 'CSV (comma-delimited)', extensions: ['csv'] },
            { name: 'Excel Macro-Enabled Workbook', extensions: ['xlsm'] },
            { name: 'Excel Binary Workbook', extensions: ['xlsb'] },
            { name: 'Excel 97-2003 Workbook', extensions: ['xls'] },
            { name: 'OpenDocument Spreadsheet', extensions: ['ods'] },
            { name: 'UTF-16 Unicode Text', extensions: ['txt'] }]
        });
        
        if (filePath) {
            this._exportTable(filePath);
        }
    };

    _exportTable(filePath) {
        this.loader.show();
        
        setTimeout(() => {
            ipcRenderer.send('exporting');
            externalDataService.exportTableData({
                outputFilePath: filePath
            }, this.tableEditorWrapper.selectedTableEditor.selectedTable).then(() => {
                this.loader.hide();
                ipcRenderer.send('exported');
        
                if (ipcRenderer.sendSync('getPreferences').general.openExcelAfterImport[0]) {
                    shell.openItem(filePath);
                }
            }).catch((err) => {
                console.error(err);
                ipcRenderer.send('export-error');
                dialog.showErrorBox('Unable to export', 'Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.');
                this.loader.hide();
            });
        }, 5);
    };

    importTable() {
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
              this._importTable(filePath[0]);
          }
    };

    _importTable(filePath) {
        this.loader.show();
          
        setTimeout(() => {
            ipcRenderer.send('importing');
            externalDataService.importTableData({
                inputFilePath: filePath
            }).then((table) => {
                const flipSaveOnChange = this.tableEditorWrapper.file.settings.saveOnChange;
                this.tableEditorWrapper.file.settings = {
                    'saveOnChange': false
                };
    
                // do not allow rows to be added.
                const trimmedTable = table.slice(0, this.tableEditorWrapper.selectedTableEditor.selectedTable.records.length);
                trimmedTable.forEach((record, index) => {
                    let franchiseRecord = this.tableEditorWrapper.selectedTableEditor.selectedTable.records[index];
                    franchiseRecord.fieldsArray.forEach((field) => {
                        field.value = record[field.key];
                    });
        
                    // Object.keys(record).forEach((key) => {
                    //     if (franchiseRecord[key] !== record[key]) {
                    //         franchiseRecord[key] = record[key];
                    //     }
                    // });
                });
        
                this.tableEditorWrapper.selectedTableEditor.selectedTable.recalculateEmptyRecordReferences();
        
                ipcRenderer.send('imported');
        
                if (flipSaveOnChange) {
                    this.file.save();
                    this.file.settings = {
                        'saveOnChange': true
                    };
                }
        
                this.tableEditorWrapper.selectedTableEditor.loadTable(this.tableEditorWrapper.selectedTableEditor.selectedTable);
            });
        }, 10);
    };

    exportRawTable() {
        let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
            'title': 'Select destination file for raw table export',
            'filters': [
                {name: 'DAT file', extensions: ['dat']}
            ]
        });
    
        if (filePath) {
            this._exportRawTable(filePath);
        }
    };

    _exportRawTable(filePath) {
        this.loader.show();
          
        setTimeout(() => {
            ipcRenderer.send('exporting');
            externalDataService.exportRawTableData({
                outputFilePath: filePath
            }, this.tableEditorWrapper.selectedTableEditor.selectedTable).then(() => {
                this.loader.hide();
                ipcRenderer.send('exported');
            }).catch((err) => {
                ipcRenderer.send('export-error');
                dialog.showErrorBox('Unable to export', `Unable to export. Error: ${err}`);
                this.loader.hide();
            });
        }, 10);
    };

    exportRawFrtk() {
        let filePath = dialog.showSaveDialogSync(getCurrentWindow(), {
            'title': 'Select destination file for raw FRT file export',
            'filters': [
              {name: 'FRT file', extensions: ['frt']}
            ]
        });
        
        if (filePath) {
            this._exportRawFrtk(filePath);
        }
    };

    _exportRawFrtk(filePath) {
        this.loader.show();
          
        setTimeout(() => {
            ipcRenderer.send('exporting');
            externalDataService.exportFrt({
                'outputFilePath': filePath
            }, this.tableEditorWrapper.file).then(() => {
                this.loader.hide();
                ipcRenderer.send('exported');
            }).catch((err) => {
                ipcRenderer.send('export-error');
                dialog.showErrorBox('Unable to export', `Error while exporting FRTK file: ${err}`);
                this.loader.hide();
            });
        }, 10);
    };

    importRawTable() {
        let filePath = dialog.showOpenDialogSync(getCurrentWindow(), {
            'title': 'Select the file to import',
            'filters': [
              {name: 'DAT file', extensions: ['dat', '*']},
            ]
        });
        
        if (filePath) {
            this._importRawTable(filePath[0]);
        }
    };

    _importRawTable(filePath) {
        this.loader.show();
          
        setTimeout(() => {
            ipcRenderer.send('importing');
    
            externalDataService.importRawTable({
                filePath: filePath
            }, this.tableEditorWrapper.selectedTableEditor.selectedTable).then(() => {
                this.tableEditorWrapper.selectedTableEditor.loadTable(this.tableEditorWrapper.selectedTableEditor.selectedTable);
                this.loader.hide();
                ipcRenderer.send('imported');
            }).catch((err) => {
                ipcRenderer.send('import-error');
                dialog.showErrorBox('Unable to import', `Unable to import the raw table. Error: ${err}`);
                this.loader.hide();
            });
        }, 10);
    };
};

module.exports = ExportHandler;