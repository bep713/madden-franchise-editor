const utilService = require('../utilService');
const Selectr = require('../../libs/selectr/selectr');

class ReferenceEditor {
    constructor(tableEditorWrapper) {
        this.referenceEditorWrapper = null;
        this.referenceEditorSelector = null;
        this.tableEditorWrapper = tableEditorWrapper;
    };

    initialize() {
        this.referenceEditorWrapper = document.getElementById('reference-editor-wrapper');
        const referenceEditorSelector = document.getElementById('reference-editor-table');

        const data = [{
            'value': 0,
            'text': `no table - null value`,
            'data-search-params': ['null', 'empty', '0']
        }, ...this.tableEditorWrapper.selectedTableEditor.tableSelector.data];

        this.referenceEditorSelector = new Selectr(referenceEditorSelector, {
            data: data
        });

        const updateBinaryInput = () => {
            const tableId = this.referenceEditorSelector.getValue();
            const newReference = utilService.calculateReferenceBinary(tableId, rowIndex.value);
            const binaryInput = document.getElementById('reference-editor-binary');
            binaryInput.value = newReference;
        };

        this.referenceEditorSelector.on('selectr.change', updateBinaryInput);

        const closeButton = this.referenceEditorWrapper.querySelector('.close');
        closeButton.addEventListener('click', () => {
            this.close();
        });

        const underlay = this.referenceEditorWrapper.querySelector('.reference-editor-underlay');
        underlay.addEventListener('click', () => {
            this.close();
        });

        const rowIndex = document.getElementById('reference-editor-row');
        rowIndex.addEventListener('change', updateBinaryInput);

        const binaryInput = document.getElementById('reference-editor-binary');
        binaryInput.addEventListener('change', () => {
            const tableId = utilService.bin2dec(binaryInput.value.substring(2,15));
            const recordIndex = utilService.bin2dec(binaryInput.value.substring(16));

            this.referenceEditorSelector.setValue(tableId);

            const rowIndex = document.getElementById('reference-editor-row');
            rowIndex.value = recordIndex;
        });

        const change = document.getElementById('btn-change-reference');
        change.addEventListener('click', () => {
            const tableId = this.referenceEditorSelector.getValue();
            const row = document.getElementById('reference-editor-row').value;
            const newReference = utilService.calculateReferenceBinary(tableId, row);

            const hotRow = parseInt(this.referenceEditorWrapper.dataset.selectedRow);
            const hotCol = parseInt(this.referenceEditorWrapper.dataset.selectedCol);
            this.tableEditorWrapper.selectedTableEditor.hot.setDataAtCell(hotRow, hotCol, newReference);
        });
    };

    close() {
        this.referenceEditorWrapper.classList.add('hidden');

        const hotRow = parseInt(this.referenceEditorWrapper.dataset.selectedRow);
        const hotCol = parseInt(this.referenceEditorWrapper.dataset.selectedCol);
        this.tableEditorWrapper.selectedTableEditor.hot.selectCell(hotRow, hotCol);
    };
};

module.exports = ReferenceEditor;