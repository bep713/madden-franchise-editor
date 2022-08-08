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
        this._handleExportRawTable();
        this._handleExportRawFrtk();
        this._handleImportRawTable();
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
            that.tableEditorService.externalDataHandler._exportTable(this.value);
            this.value = '';
        });
    };

    _handleImportTable() {
        const that = this;

        this._addTestElement('import-table-input', function () {
            that.tableEditorService.externalDataHandler._importTable(this.value);
            this.value = '';
        });
    };

    _handleExportRawTable() {
        const that = this;

        this._addTestElement('export-raw-table', function () {
            that.tableEditorService.externalDataHandler._exportRawTable(this.value);
            this.value = '';
        });
    };

    _handleExportRawFrtk() {
        const that = this;

        this._addTestElement('export-raw-frtk', function () {
            that.tableEditorService.externalDataHandler._exportRawFrtk(this.value);
            this.value = '';
        });
    };

    _handleImportRawTable() {
        const that = this;

        this._addTestElement('import-raw-table', function () {
            that.tableEditorService.externalDataHandler._importRawTable(this.value);
            this.value = '';
        });
    };
};

module.exports = TestUtility;