class TableEditorPage {
    constructor(window) {
        this.window = window;
        this.locators = {
            tableSelector: this.window.locator('.table-list > .selectr-container'),
            tableSelectorInput: this.window.locator('.table-list > .selectr-container .selectr-input'),
            tableContainer: this.window.locator('.ht_master .wtHolder'),
            firstTableCell: this.window.locator('.ht_master tbody tr:nth-of-type(1) td:nth-of-type(1)'),
            topLeftCell: this.window.locator('.ht_clone_top_left_corner thead th:first-child')
        }

        this._selectedTableCell = {
            row: 0,
            col: 0
        };
    };

    get selectedTableCell() {
        return this._selectedTableCell;
    };

    setSelectedTableCell(row, col) {
        this._selectedTableCell.row = row;
        this._selectedTableCell.col = col;
    };

    async openTableById(tableId) {
        await this.locators.tableSelector.click();
        await this.locators.tableSelectorInput.type(`${tableId}`);
        await this.window.click(`.selectr-option:has-text("(${tableId})")`);
    };

    async getTextAtSelectedCell() {
        return this._getCellText(`.table-content-wrapper td.current`)
    };

    async _getCellText(baseCellSelector) {
        const text = await this.window.textContent(baseCellSelector);
    
        if (!text) {
            return await this.window.textContent(`${baseCellSelector} > div > a`);
        }
        else {
            return text;
        }
    };

    async selectCellAt(row, col) {
        // Reset selected cell to (0, 0)
        await this.locators.topLeftCell.click();

        // Move to desired cell
        let promises = [];

        for (let i = 0; i < col; i++) {
            promises.push(this.window.keyboard.press('ArrowRight'));
        }

        for (let i = 0; i < row; i++) {
            promises.push(this.window.keyboard.press('ArrowDown'));
        }

        await Promise.all(promises);
        this.setSelectedTableCell(row, col);
    };
};

module.exports = TableEditorPage;

