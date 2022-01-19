const SelectrComponent = require("./SelectrComponent");

class ReferenceEditorModal {
    constructor(window) {
        this.window = window;
        this.tableSelector = new SelectrComponent(this.window, '.reference-editor-content .selectr-container');

        this.locators = {
            rowIndex: this.window.locator('#reference-editor-row'),
            binary: this.window.locator('#reference-editor-binary'),
            change: this.window.locator('#btn-change-reference'),
            close: this.window.locator('.reference-title-wrapper .close')
        };
    };

    async setTableReferenceById(tableId) {
        await this.tableSelector.selectOption(tableId);
    };

    async getSelectedTable() {
        return this.tableSelector.getSelectedOptionText();
    };

    async setRowIndex(rowIndex) {
        await this.locators.rowIndex.fill(`${rowIndex}`);
        await this.window.keyboard.press('Tab');
        await this.window.keyboard.press('Shift+Tab');
    };

    async getRowIndex() {
        return this.locators.rowIndex.inputValue();
    };

    async setBinary(binary) {
        await this.locators.binary.type(binary);
    };

    async getBinary() {
        return this.locators.binary.inputValue();
    };

    async clickChangeReferenceButton() {
        await this.locators.change.click();
    };

    async close() {
        await this.locators.close.click();
    };
};

module.exports = ReferenceEditorModal;