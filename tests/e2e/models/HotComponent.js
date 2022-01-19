const BaseComponent = require("./BaseComponent");

class HotComponent extends BaseComponent {
    constructor(window, baseSelector) {
        super(window, baseSelector);

        this.locators = {
            container: this.baseLocator.locator('.ht_master .wtHolder'),
            selectedCell: this.baseLocator.locator('.table-content-wrapper td.current'),
            topLeftCell: this.baseLocator.locator('.ht_clone_top_left_corner thead th:first-child'),
            firstCell: this.baseLocator.locator('.ht_master tbody tr:nth-of-type(1) td:nth-of-type(1)'),
        };

        this._selectedTableCell = {
            row: 0,
            col: 0
        };
    };

    get selectedTableCellMeta() {
        return this._selectedTableCell;
    };

    get selectedTableCellLocator() {
        return this.locators.selectedCell;
    };

    setSelectedTableCell(row, col) {
        this._selectedTableCell.row = row;
        this._selectedTableCell.col = col;
    };

    async getTextAtSelectedCell() {
        return this._getCellText(`.table-content-wrapper td.current`);
    };

    async _getCellText(baseCellSelector) {
        const text = await this.window.textContent(baseCellSelector);
    
        if (!text) {
            return this.window.textContent(`${baseCellSelector} > div > a`);
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

    async setTextAtSelectedCell(text) {
        await this.locators.selectedCell.type(text);
        await this.window.keyboard.press('Enter');
        await this.window.keyboard.press('ArrowUp');
    };
};

module.exports = HotComponent;