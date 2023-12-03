const { JSONEditor } = require('../../../../libs/vanilla-jsoneditor/jsoneditor.umd');

class BinaryBlobEditor {
    constructor(tableEditorWrapper) {
        this.editor = null;
        this.cellContent = {};
        this.blobEditorDom = null;
        this.blobEditorWrapper = null;
        this.tableEditorWrapper = tableEditorWrapper;
    };

    initialize() {
        this.blobEditorWrapper = document.getElementById('blob-editor-modal');
        this.blobEditorUnderlay = document.querySelector('.blob-editor-underlay');
        this.blobEditorDom = document.getElementById('blob-editor');

        // const data = [{
        //     'value': 0,
        //     'text': `no table - null value`,
        //     'data-search-params': ['null', 'empty', '0']
        // }, ...this.tableEditorWrapper.selectedTableEditor.tableSelector.data];

        // this.referenceEditorSelector = new Selectr(referenceEditorSelector, {
        //     data: data
        // });

        // const updateBinaryInput = () => {
        //     const tableId = this.referenceEditorSelector.getValue();
        //     const newReference = utilService.calculateReferenceBinary(tableId, rowIndex.value);
        //     const binaryInput = document.getElementById('reference-editor-binary');
        //     binaryInput.value = newReference;
        // };

        // this.referenceEditorSelector.on('selectr.change', updateBinaryInput);

        const closeButton = document.querySelector('.blob-editor-modal .close-modal');
        closeButton.addEventListener('click', () => {
            this.close();
        });

        const underlay = document.querySelector('.blob-editor-underlay');
        underlay.addEventListener('click', () => {
            this.close();
        });

        // const rowIndex = document.getElementById('reference-editor-row');
        // rowIndex.addEventListener('change', updateBinaryInput);

        // const binaryInput = document.getElementById('reference-editor-binary');
        // binaryInput.addEventListener('change', () => {
        //     const tableId = utilService.bin2dec(binaryInput.value.substring(2,15));
        //     const recordIndex = utilService.bin2dec(binaryInput.value.substring(16));

        //     this.referenceEditorSelector.setValue(tableId);

        //     const rowIndex = document.getElementById('reference-editor-row');
        //     rowIndex.value = recordIndex;
        // });

        // const change = document.getElementById('btn-change-reference');
        // change.addEventListener('click', () => {
        //     const tableId = this.referenceEditorSelector.getValue();
        //     const row = document.getElementById('reference-editor-row').value;
        //     const newReference = utilService.calculateReferenceBinary(tableId, row);

        //     const hotRow = parseInt(this.blobEditorWrapper.dataset.selectedRow);
        //     const hotCol = parseInt(this.blobEditorWrapper.dataset.selectedCol);
        //     this.tableEditorWrapper.selectedTableEditor.hot.setDataAtCell(hotRow, hotCol, newReference);
        // });
    };

    initializeEditor(content) {
        this.editor = new JSONEditor({
            target: this.blobEditorDom,
            props: {
                content: {
                    json: content
                },
                mode: 'text',
                onRenderMenu: (items) => {
                    return items.filter(v => v.text !== "table" && v.text !== "tree" && v.type === "button");
                }
            }
        });
    };

    updateContent(content) {
        this.editor.updateProps({
            content: {
                json: content
            }
        });
    }

    close() {
        this.blobEditorWrapper.classList.add('hidden');
        this.blobEditorUnderlay.classList.add('hidden');

        const hotRow = parseInt(this.blobEditorWrapper.dataset.selectedRow);
        const hotCol = parseInt(this.blobEditorWrapper.dataset.selectedCol);

        const editedData = this.editor.get();
        let newData = {};

        if (editedData.text) {
            newData = JSON.parse(editedData.text);
        }
        else {
            newData = editedData.json;
        }

        this.tableEditorWrapper.selectedTableEditor.hot.setDataAtCell(hotRow, hotCol, newData);
        this.tableEditorWrapper.selectedTableEditor.hot.selectCell(hotRow, hotCol);

        this.editor.destroy();
    };
};

module.exports = BinaryBlobEditor;