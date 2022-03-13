const Selectr = require('../../libs/selectr/selectr');
const { default: Handsontable } = require("handsontable");

const utilService = require('../utilService');
const contextMenuService = require('./contextMenuService');
const referenceViewerService = require('../referenceViewerService');

class TableEditorView {
    constructor(file, container, parent) {
        this.file = file;
        this.baseContainer = document.querySelector(container);
        this.parent = parent;

        this.navSteps = [];
        this.rowIndexToSelect = 0;
        this.tableSelector = null;
        this.selectedTable = null;
        this.columnIndexToSelect = 0;
        this.showHeaderTypes = false;
        this.currentlySelectedRow = 0;
        this.initialTableSelect = null;
        this.currentlySelectedColumn = 0;
        this.loader = document.querySelector('.loader-wrapper');
        this.referenceEditorSelector = this.parent.referenceEditorSelector;

        this.hot = new Handsontable(this.baseContainer, {
            height: '100%',
            rowHeaders: true,
            manualRowResize: true,
            manualColumnResize: true,
            currentRowClassName: 'active-row',
            licenseKey: 'non-commercial-and-evaluation',
            afterChange: this._processChanges.bind(this),
            afterSelection: this._processSelection.bind(this),
            contextMenu: contextMenuService.getContextMenu(this),
            rowHeaders: function (index) {
                return index;
            },
        });

        this._addEventListeners();
        this._initialLoad();
    };

    _processSelection(row, col, row2, col2) {
        this.currentlySelectedRow = row;
        this.currentlySelectedColumn = col;
    };

    _processChanges(changes, source) {
        if (changes && source !== 'onEmpty') {
            const flipSaveOnChange = this.file.settings.saveOnChange;
            this.file.settings = {
                'saveOnChange': false
            };
        
            changes.forEach((change) => {
                const recordIndex = this.hot.toPhysicalRow(change[0]);
                const key = change[1];
                const oldValue = change[2];
                const newValue = change[3];
        
                const colNumber = this.selectedTable.offsetTable.findIndex((offset) => { return offset.name === key; });
        
                try {
                    let field = this.selectedTable.records[recordIndex].fields[key];
                    field.value = newValue;
            
                    if (field.value !== newValue) {
                        this.hot.setDataAtCell(recordIndex, colNumber, field.value);
                    }
                }
                catch (err) {
                    this.hot.setDataAtCell(recordIndex, colNumber, oldValue)
                }
            });
        
            if (flipSaveOnChange) {
                this.file.save();
                this.file.settings = {
                    'saveOnChange': true
                };
            }
        }
    };

    _addEventListeners() {
        const jumpToColumnModal = document.querySelector('.jump-to-column-modal');
        const underlay = document.querySelector('.underlay');
        const jumpRow = document.querySelector('.jump-row');
        
        const toggleTypesButton = document.querySelector('.toggle-types');
        toggleTypesButton.addEventListener('click', () => {
            this.showHeaderTypes = !this.showHeaderTypes;
            const headers = this._formatHeaders(this.selectedTable);
        
            this.hot.updateSettings({
                colHeaders: headers
            });
        });
        
        const columnSelect = document.querySelector('#available-columns');
        let columnSelectr = new Selectr(columnSelect, {
            data: null
        });
    
        const closeModalButton = document.querySelector('.close-modal');
        closeModalButton.addEventListener('click', () => {
            jumpToColumnModal.classList.add('hidden');
            underlay.classList.add('hidden');
        });

        const goJumpToColumnListener = () => {
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
          
            this.navSteps.push({
              'tableId': this.selectedTable.header.tableId,
              'recordIndex': row,
              'column': index
            });
          
            window.removeEventListener('keypress', onEnterJumpToColumn);
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

        const jumpToColumnButton = document.querySelector('.jump-to-column');
        jumpToColumnButton.addEventListener('click', jumpToColumnListener);
    
        const goJumpToColumnButton = document.querySelector('.btn-go-jump-to-column');
        goJumpToColumnButton.addEventListener('click', goJumpToColumnListener);
        
        const backLink = document.querySelector('.back-link');
        backLink.addEventListener('click', () => {
        
            if (this.navSteps.length >= 2) {
                this.navSteps.pop();
            
                const navStep = this.navSteps[this.navSteps.length - 1];
                const table = this.file.getTableById(navStep.tableId);
            
                this.rowIndexToSelect = navStep.recordIndex;
                this.columnIndexToSelect = navStep.column;
            
                this.tableSelector.setValue(navStep.tableId);
                this.navSteps.pop();
            
                this.selectedTable = table;
        
                setTimeout(() => {
                    if (this.navSteps.length === 1) {
                        backLink.classList.add('disabled');
                    }
                }, 200);
            }
        });
    };

    _initialLoad() {
        const tableChoices = this.file.tables.map((table, index) => {
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
        this.tableSelector = new Selectr(tableSelector, {
            data: tableChoices
        });
    
        const backLink = document.querySelector('.back-link');
    
        this.tableSelector.on('selectr.change', (option) => {
            console.time('change');
            utilService.show(this.loader);
        
            setTimeout(() => {
                const tableId = parseInt(this.tableSelector.getValue(true).value);
                const table = this.file.getTableById(tableId);

                console.time('read records');        
                table.readRecords().then((table) => {
                    console.timeEnd('read records');
                    this.loadTable(table);
                    this.hot.selectCell(this.rowIndexToSelect, this.columnIndexToSelect);
                
                    this.rowIndexToSelect = 0;
                    this.columnIndexToSelect = 0;
                    
                    this.navSteps.push({
                        'tableId': table.header.tableId,
                        'recordIndex': this.hot.getSelectedLast()[0],
                        'column': this.hot.getSelectedLast()[1]
                    });
            
                })
                .catch((err) => {
                    console.log(err);
                    this.loadTable(table);
                
                    this.navSteps.push({
                        'tableId': table.header.tableId,
                        'recordIndex': 0,
                        'column': 0
                    });
                })
                .finally(() => {
                    this.selectedTable = table;
                
                    if (this.navSteps.length >= 2) {
                        backLink.classList.remove('disabled');
                    }

                    utilService.hide(this.loader);
                
                    this.parent._toggleAddPinButton(table.header.tableId);
                    console.timeEnd('change');
                });
            }, 100);
        });
        
        if (this.initialTableToSelect) {
            this.rowIndexToSelect = this.initialTableToSelect.recordIndex;
            this.columnIndexToSelect = 0;
        
            this.tableSelector.setValue(this.initialTableToSelect.tableId);
            this.initialTableToSelect = null;
        } else {
            this.tableSelector.setValue(tableChoices[1].value);
        
            const tableToLoad = this.file.getAllTablesByName(tableChoices[1].text.substring(tableChoices[1].text.indexOf(' ') + 3));
            this.selectedTable = tableToLoad[tableToLoad.length - 1];
        }
    };

    loadTable(table) {
        console.time('get data');
        const data = this._formatTable(table);
        console.timeEnd('get data');
        const headers = this._formatHeaders(table);
        const columns = this._formatColumns(table);

        // this.hot.loadData(data);
        this.hot.updateSettings({
            data: data,
            colHeaders: headers,
            columns: columns,
            colWidths: this._calculateColumnWidths(columns, table)
        });

        this.hot.selectCell(this.rowIndexToSelect, this.columnIndexToSelect);

        utilService.hide(this.loader);
    };

    _formatTable(table) {
        return table.records.map((record) => {
            return record.fieldsArray.reduce((accumulator, currentValue) => {
                    accumulator[currentValue.key] = currentValue.value;
                    return accumulator;
            }, {});
        });
    };

    _formatHeaders(table) {
        if (table.offsetTable) {
            if (this.showHeaderTypes) {
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

    _formatColumns(table) {
        if (table.offsetTable) {
            return table.offsetTable.map((offset) => {
                return {
                    'data': offset.name,
                    'renderer': offset.type === 'Spline' ? this.parent.referenceRenderer.renderer.bind(this.parent.referenceRenderer) : offset.isReference ? 
                        this.parent.referenceRenderer.renderer.bind(this.parent.referenceRenderer) : offset.enum || offset.type === 'bool' ? 'dropdown' : 'text',
                    'wordWrap': false,
                    'editor': offset.enum || offset.type === 'bool' ? 'dropdown' : 'text',
                    'source': offset.enum ? offset.enum.members.map((member) => { return member.name; }) : offset.type === 'bool' ? ['true', 'false'] : []
                };
            });
        } else {
            return [];
        }
    };

    _calculateColumnWidths(columns, table) {
        return columns.map((col, index) => {
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
    };

    showReferenceViewer(referencedRecordData, references) {
        referenceViewerService.showReferenceViewer(referencedRecordData, references);
    };
};

module.exports = TableEditorView;