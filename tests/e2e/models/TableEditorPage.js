const util = require('../util/UiTestUtil');
const ColumnJumpModal = require('./ColumnJumpModal');

const HotComponent = require("./HotComponent");
const PinComponent = require("./PinComponent");
const SelectrComponent = require("./SelectrComponent");
const TabComponent = require('./TabComponent');

class TableEditorPage {
    constructor(window) {
        this.window = window;

        this.tabs = new TabComponent(this.window, '.tab-wrapper');
        this.jumpToColumnModal = new ColumnJumpModal(this.window);
        this.table = new HotComponent(this.window, '.table-wrapper');
        this.pins = new PinComponent(this.window, '.table-pins-wrapper');
        this.tableSelector = new SelectrComponent(this.window, '.table-list-top-bar > .selectr-container');

        this.locators = {
            backButton: this.window.locator('.back-link'),
            jumpToColumn: this.window.locator('.jump-to-column'),
            loadingSpinner: this.window.locator('.loader-wrapper'),
            exportTableInput: this.window.locator('#export-table-input'),
            jumpToColumnModalSelector: this.window.locator('.jump-to-column-modal .selectr-container'),
            selectedCellEditReference: this.window.locator('.table-content-wrapper td.current .edit-button'),
        };
    };

    get selectedTableCell() {
        return this.table.selectedTableCellMeta;
    };

    setSelectedTableCell(row, col) {
        this.table.setSelectedTableCell(row, col);
    };

    async openTableById(tableId) {
        await this.tableSelector.selectOption(`${tableId}`);
        await this._waitForTableToLoad();
    };

    async _waitForTableToLoad() {
        await this.locators.loadingSpinner.waitFor({
            state: 'hidden'
        });
    };

    async getTextAtSelectedCell() {
        return this.table.getTextAtSelectedCell();
    };

    async selectCellAt(row, col) {
        await this.table.selectCellAt(row, col);
    };

    async setTextAtSelectedCell(text) {
        await this.table.setTextAtSelectedCell(text);
    };

    async followSelectedCellReference() {
        await this.table.selectedTableCellLocator.click({
            position: {
                x: 20,
                y: 20
            }
        });

        const referenceText = await this.table.getTextAtSelectedCell();
        const rowIndex = parseInt(referenceText.match(/.+-\s(\d+)/)[1]);

        this.table.setSelectedTableCell(rowIndex, 0);

        await this._waitForTableToLoad();
    };

    async getSelectedTableName() {
        return this.tableSelector.getSelectedOptionText();
    };

    async openEditReferenceModalAtSelectedCell() {
        await this.table.selectedTableCellLocator.hover();
        await this.locators.selectedCellEditReference.click();
    };

    async getAllPins() {
        return this.pins.getAllPins();
    };

    async addSelectedTableAsPin() {
        await this.pins.addPin();
    };

    async removePinByTableId(tableId) {
        await this.pins.removePinByTableId(tableId);
    };

    async clickPinByTableId(tableId) {
        await this.pins.clickPinByTableId(tableId);
        await this._waitForTableToLoad();
    };

    async clickBackButton() {
        await this.locators.backButton.click();
    };

    async exportTable(path) {
        await util.enterFilePath(this.window, '#export-table-input', path);
        await this._waitForTableToLoad();
    };

    async importTable(path) {
        await util.enterFilePath(this.window, '#import-table-input', path);
        await this._waitForTableToLoad();
    };

    async openColumnJumpModal() {
        await this.locators.jumpToColumn.click();
        await this.locators.jumpToColumnModalSelector.click();
    };

    async jumpToColumn(col, row) {
        await this.openColumnJumpModal();
        await this.jumpToColumnModal.setColumn(col);
        await this.jumpToColumnModal.setRowIndex(row);
        await this.jumpToColumnModal.go();
    };

    async exportRawTable(filePath) {
        await util.enterFilePath(this.window, '#export-raw-table', filePath);
        await this._waitForTableToLoad();
    };

    async exportRawFrtkFile(filePath) {
        await util.enterFilePath(this.window, '#export-raw-frtk', filePath);
        await this._waitForTableToLoad();
    };

    async importRawTable(filePath) {
        await util.enterFilePath(this.window, '#import-raw-table', filePath);
        await this._waitForTableToLoad();
    };
};

module.exports = TableEditorPage;