const HotComponent = require("./HotComponent");
const PinComponent = require("./PinComponent");
const SelectrComponent = require("./SelectrComponent");

class TableEditorPage {
    constructor(window) {
        this.window = window;

        this.tableSelector = new SelectrComponent(this.window, '.table-list > .selectr-container');
        this.table = new HotComponent(this.window, '.table-wrapper');
        this.pins = new PinComponent(this.window, '.table-pins-wrapper');

        this.locators = {
            selectedCellEditReference: this.window.locator('.table-content-wrapper td.current .edit-button'),
            loadingSpinner: this.window.locator('.loader-wrapper')
        };
    };

    get selectedTableCell() {
        return this.table.selectedTableCellMeta;
    };

    setSelectedTableCell(row, col) {
        this.table.setSelectedTableCell(row, col);
    };

    async openTableById(tableId) {
        await this.tableSelector.selectOption(tableId);
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
};

module.exports = TableEditorPage;

