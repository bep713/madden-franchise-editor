const utilService = require('../utilService');

class ReferenceRenderer {
    constructor(tableEditorView) {
        this.tableEditorView = tableEditorView;
    };

    renderer(instance, td, row, col, prop, value, cellProperties) {
        if (value && value.length === 32) {
            utilService.removeChildNodes(td);
            const otherTableFlag = value[0];
          
            if (otherTableFlag === '0') {
                const tableId = utilService.bin2dec(value.substring(2,15));
                const recordIndex = utilService.bin2dec(value.substring(16));
                const table = this.tableEditorView.file.getTableById(tableId);
        
                const referenceWrapper = document.createElement('div');
                    
                if (tableId > 0 && table) {
                    cellProperties.editor = false;
            
                    const referenceLink = document.createElement('a');
                    referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
                    referenceWrapper.appendChild(referenceLink);
            
                    referenceLink.addEventListener('click', () => {
                        this.tableEditorView.navSteps[this.tableEditorView.navSteps.length - 1].column = col;
                        this.tableEditorView.navSteps[this.tableEditorView.navSteps.length - 1].recordIndex = row;
            
                        this.tableEditorView.rowIndexToSelect = recordIndex;
                        this.tableEditorView.columnIndexToSelect = 0;
            
                        if (table.header.tableId != this.tableEditorView.tableSelector.getValue()) {
                            this.tableEditorView.tableSelector.setValue(table.header.tableId);
                        } 
                        else {
                            this.tableEditorView.hot.selectCell(recordIndex, 0);
                        }
            
                        setTimeout(() => {
                            this.tableEditorView.navSteps[this.tableEditorView.navSteps.length - 1].recordIndex = recordIndex;
                        }, 1000);
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

        this.tableEditorView.parent.referenceEditorSelector.setValue(tableId);
        
        const rowInput = document.getElementById('reference-editor-row');
        rowInput.value = recordIndex;

        const binaryInput = document.getElementById('reference-editor-binary');
        binaryInput.value = value;
    };
};

module.exports = ReferenceRenderer;