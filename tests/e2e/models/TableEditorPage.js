class TableEditorPage {
    constructor(window) {
        this.window = window;
        this.locators = {
            tableSelector: this.window.locator('.table-list > .selectr-container'),
            tableSelectorInput: this.window.locator('.table-list > .selectr-container .selectr-input'),
            tableContainer: this.window.locator('.ht_master .wtHolder'),
            firstTableCell: this.window.locator('.ht_master tbody tr:nth-of-type(1) td:nth-of-type(1)')
        }
    };

    async openTableById(tableId) {
        await this.locators.tableSelector.click();
        await this.locators.tableSelectorInput.type(`${tableId}`);
        await this.window.click(`.selectr-option:has-text("(${tableId})")`);
    };

    async getTextAtCell(row, col) {
        const text = await this.window.textContent(`.table-content-wrapper tbody tr:nth-of-type(${row}) td:nth-of-type(${col})`);

        if (!text) {
            return await this.window.textContent(`.table-content-wrapper tbody tr:nth-of-type(${row}) td:nth-of-type(${col}) > div > a`);
        }
        else {
            return text;
        }
    };

    async scrollToColumn(col) {
        await this.locators.firstTableCell.focus();
        await this.locators.firstTableCell.press('ArrowRight');
    };
};

module.exports = TableEditorPage;