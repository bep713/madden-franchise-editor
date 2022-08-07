const utilService = require('../utilService');

class ReferenceRenderer {
    constructor(tableEditorWrapper) {
        this.tableEditorWrapper = tableEditorWrapper;
    };

    renderer(instance, td, row, col, prop, value, cellProperties) {
        if (value && value.length === 32) {
            utilService.removeChildNodes(td);
            const otherTableFlag = value[0];
          
            if (otherTableFlag === '0') {
                const tableId = utilService.bin2dec(value.substring(2,15));
                const recordIndex = utilService.bin2dec(value.substring(16));
                const table = this.tableEditorWrapper.file.getTableById(tableId);
        
                const referenceWrapper = document.createElement('div');
                    
                if (tableId > 0 && table) {
                    cellProperties.editor = false;
            
                    const referenceLink = document.createElement('a');
                    referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
                    referenceWrapper.appendChild(referenceLink);
            
                    referenceLink.addEventListener('click', (event) => {
                        this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].column = col;
                        this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].recordIndex = row;
            
                        this.tableEditorWrapper.selectedTableEditor.rowIndexToSelect = recordIndex;
                        this.tableEditorWrapper.selectedTableEditor.columnIndexToSelect = 0;
            
                        if (table.header.tableId != this.tableEditorWrapper.selectedTableEditor.tableSelector.getValue()) {
                            this.tableEditorWrapper.selectedTableEditor.tableSelector.setValue(table.header.tableId);
                        } 
                        else {
                            this.tableEditorWrapper.selectedTableEditor.hot.selectCell(recordIndex, 0);
                        }
            
                        setTimeout(() => {
                            this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].recordIndex = recordIndex;
                        }, 125);
                    });

                    referenceLink.addEventListener('auxclick', (event) => {
                        this.tableEditorWrapper.lastSelectedCell.row = row;
                        this.tableEditorWrapper.lastSelectedCell.column = col;

                        this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].column = col;
                        this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].recordIndex = row;
                        
                        if (event.button === 1) {
                            this.tableEditorWrapper._openTableInNewTab(table.header.tableId, recordIndex);
                        }
                    });
                } else {
                    referenceWrapper.innerHTML = value;
                }
        
                // Allow user to manually edit the reference
                referenceWrapper.classList.add('table-cell--with-button', 'table-cell-button--show-on-hover');
                const referenceEditorButton = document.createElement('button');
                referenceEditorButton.classList.add('table-cell-button', 'table-cell-button--right', 'edit-button');
                referenceWrapper.appendChild(referenceEditorButton);
        
                referenceEditorButton.addEventListener('click', () => {
                    this._referenceEditorOnClick(td, row, col, tableId, recordIndex, value);
                });
        
                td.appendChild(referenceWrapper);
            } else {
                td.innerHTML = value;
            }
        } else {
          td.innerHTML = value;
        }
      
        return td;
    };

    _referenceEditorOnClick(td, row, col, tableId, recordIndex, value) {
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

        this.tableEditorWrapper.referenceEditor.referenceEditorSelector.setValue(tableId);
        
        const rowInput = document.getElementById('reference-editor-row');
        rowInput.value = recordIndex;

        const binaryInput = document.getElementById('reference-editor-binary');
        binaryInput.value = value;
    };
};

module.exports = ReferenceRenderer;