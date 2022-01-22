const SelectrComponent = require("./SelectrComponent");

class ColumnJumpModal {
    constructor(window) {
        this.window = window;
        this.tableSelector = new SelectrComponent(this.window, '.jump-to-column-modal .selectr-container');

        this.locators = {
            go: this.window.locator('.btn-go-jump-to-column'),
            rowIndex: this.window.locator('.jump-to-column-modal .jump-row'),
            close: this.window.locator('.jump-to-column-modal .close-modal')
        };
    };

    async setColumn(col) {
        await this.tableSelector.selectOption(col);
    };

    async getSelectedColumn() {
        return this.tableSelector.getSelectedOptionText();
    };

    async setRowIndex(rowIndex) {
        await this.locators.rowIndex.fill(`${rowIndex}`);
    };

    async getRowIndex() {
        return this.locators.rowIndex.inputValue();
    };

    async go() {
        await this.locators.go.click();
    };

    async close() {
        await this.locators.close.click();
    };
};

module.exports = ColumnJumpModal;