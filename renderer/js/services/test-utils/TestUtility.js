class TestUtility {
    constructor(welcomeService, tableEditorService) {
        this.welcomeService = welcomeService;
        this.tableEditorService = tableEditorService;

        this._initialize();
    };

    _initialize() {
        this._handleOpenFile();
        this._handleExportTable();
        this._handleImportTable();
    };

    _handleOpenFile() {
        const that = this;

        this._addTestElement('open-file-input', function () {
            that.welcomeService.openFileFromPath(this.value);
            this.value = '';
        });
    };

    _addTestElement(id, listener) {
        let wrapper = document.createElement('div');
        wrapper.innerHTML = `<input type="text" id="${id}" class="hidden">`;
        wrapper.classList.add('test-helper');
        document.body.appendChild(wrapper);

        const inputElement = document.getElementById(id);
        inputElement.addEventListener('change', listener);
    };

    _handleExportTable() {
        const that = this;

        this._addTestElement('export-table-input', function () {
            that.tableEditorService.wrapper.externalDataHandler._exportTable(this.value, that.tableEditorService.wrapper.selectedTableEditor.selectedTable);
            this.value = '';
        });
    };

    _handleImportTable() {
        const that = this;

        this._addTestElement('import-table-input', function () {
            that.tableEditorService.wrapper.externalDataHandler._importTable(this.value, that.tableEditorService.wrapper.selectedTableEditor.selectedTable);
            this.value = '';
        });
    };
};

module.exports = TestUtility;