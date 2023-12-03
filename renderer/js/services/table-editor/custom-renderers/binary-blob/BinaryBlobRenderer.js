const utilService = require('../../../utilService');

class BinaryBlobRenderer {
    constructor(tableEditorWrapper) {
        this.tableEditorWrapper = tableEditorWrapper;
    };

    renderer(instance, td, row, col, prop, value, cellProperties) {
        utilService.removeChildNodes(td);

        cellProperties.editor = false;

        const blobWrapper = document.createElement('div');
        blobWrapper.classList.add('table-cell--with-button', 'table-cell-button--show-on-hover');
        
        const blobEditorText = document.createElement('div');
        blobEditorText.classList.add('blob-editor-text-content');
        blobEditorText.innerText = value;

        const blobEditorButton = document.createElement('button');
        blobEditorButton.classList.add('table-cell-button', 'table-cell-button--right', 'edit-button');
        
        blobWrapper.appendChild(blobEditorText);
        blobWrapper.appendChild(blobEditorButton);

        blobEditorButton.addEventListener('click', () => {
            this._blobEditorOnClick(td, row, col, value);
        });

        td.appendChild(blobWrapper);

        // const otherTableFlag = value[0];
        
        // if (otherTableFlag === '0') {
        //     const tableId = utilService.bin2dec(value.substring(2,15));
        //     const recordIndex = utilService.bin2dec(value.substring(16));
        //     const table = this.tableEditorWrapper.file.getTableById(tableId);
    
        //     const referenceWrapper = document.createElement('div');
                
        //     if (tableId > 0 && table) {
        //         cellProperties.editor = false;
        
        //         const referenceLink = document.createElement('a');
        //         referenceLink.innerHTML = `${table.name} - ${recordIndex}`;
        //         referenceWrapper.appendChild(referenceLink);
        
        //         referenceLink.addEventListener('click', (event) => {
        //             this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].column = col;
        //             this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].recordIndex = row;
        
        //             this.tableEditorWrapper.selectedTableEditor.rowIndexToSelect = recordIndex;
        //             this.tableEditorWrapper.selectedTableEditor.columnIndexToSelect = 0;
        
        //             if (table.header.tableId != this.tableEditorWrapper.selectedTableEditor.tableSelector.getValue()) {
        //                 this.tableEditorWrapper.selectedTableEditor.tableSelector.setValue(table.header.tableId);
        //             } 
        //             else {
        //                 this.tableEditorWrapper.selectedTableEditor.hot.selectCell(recordIndex, 0);
        //             }
        
        //             setTimeout(() => {
        //                 this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].recordIndex = recordIndex;
        //             }, 125);
        //         });

        //         referenceLink.addEventListener('auxclick', (event) => {
        //             this.tableEditorWrapper.lastSelectedCell.row = row;
        //             this.tableEditorWrapper.lastSelectedCell.column = col;

        //             this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].column = col;
        //             this.tableEditorWrapper.selectedTableEditor.navSteps[this.tableEditorWrapper.selectedTableEditor.navSteps.length - 1].recordIndex = row;
                    
        //             if (event.button === 1) {
        //                 this.tableEditorWrapper._openTableInNewTab(table.header.tableId, recordIndex);
        //             }
        //         });
        //     } else {
        //         referenceWrapper.innerHTML = value;
        //     }
    
        //     // Allow user to manually edit the reference
        //     referenceWrapper.classList.add('table-cell--with-button', 'table-cell-button--show-on-hover');
        //     const referenceEditorButton = document.createElement('button');
        //     referenceEditorButton.classList.add('table-cell-button', 'table-cell-button--right', 'edit-button');
        //     referenceWrapper.appendChild(referenceEditorButton);
    
        //     referenceEditorButton.addEventListener('click', () => {
        //         this._referenceEditorOnClick(td, row, col, tableId, recordIndex, value);
        //     });
    
        //     td.appendChild(referenceWrapper);
        // } else {
        //     td.innerHTML = value;
        // }
      
        return td;
    };

    _blobEditorOnClick(td, row, col, value) {
        this.tableEditorWrapper.blobEditor.blobEditorWrapper.classList.remove('hidden');
        this.tableEditorWrapper.blobEditor.blobEditorUnderlay.classList.remove('hidden');

        this.tableEditorWrapper.blobEditor.blobEditorWrapper.dataset.selectedRow = row;
        this.tableEditorWrapper.blobEditor.blobEditorWrapper.dataset.selectedCol = col;

        

        // const blobEditorContent = document.getElementById('reference-editor-content');
        // const blobEditorHighlight = document.getElementById('reference-editor-highlight');

        // const blobEditorClientRect = blobEditorContent.getBoundingClientRect();
        // const tdClientRect = td.getBoundingClientRect();
        // const windowClientRect = document.body.getBoundingClientRect();
        
        // const blobEditorShouldDisplayOnTop = (tdClientRect.bottom + blobEditorClientRect.height) >= (windowClientRect.bottom - 20);

        // if (blobEditorShouldDisplayOnTop) {
        //     blobEditorContent.style.top = (tdClientRect.top - blobEditorClientRect.height) + 'px';
        // }
        // else {
        //     blobEditorContent.style.top = tdClientRect.bottom + 'px';
        // }

        // blobEditorContent.style.left = tdClientRect.left + 'px';

        // blobEditorHighlight.style.top = tdClientRect.top + 'px';
        // blobEditorHighlight.style.left = tdClientRect.left + 'px';
        // blobEditorHighlight.style.width = tdClientRect.width + 'px';
        // blobEditorHighlight.style.height = tdClientRect.height + 'px';

        let jsonData = {};

        try {
            jsonData = JSON.parse(value);
        }
        catch (err) {
            console.warn(err);
        }

        this.tableEditorWrapper.blobEditor.initializeEditor(jsonData);
    };
};

module.exports = BinaryBlobRenderer;