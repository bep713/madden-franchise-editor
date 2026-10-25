// Handsontable 16 version of models/HotComponent.js
class Grid {
  constructor(window) {
    this.window = window;
    this.locators = {
      master: this.window.locator(".ht_master"),
      selectedCell: this.window.locator(".ht_master td.current"),
      firstCell: this.window.locator(
        ".ht_master tbody tr:nth-of-type(1) td:nth-of-type(1)",
      ),
      headers: this.window.locator(
        ".ht_clone_top thead tr:last-child th .colHeader",
      ),
    };
  }

  async selectCellAt(row, col) {
    await this.locators.firstCell.click();

    // Handsontable scrolls virtualized rows and columns into view
    for (let i = 0; i < col; i++) {
      await this.window.keyboard.press("ArrowRight");
    }
    for (let i = 0; i < row; i++) {
      await this.window.keyboard.press("ArrowDown");
    }
  }

  // columnNames: the table's headers in order (from App.readTable). The
  // grid's header row is virtualized, so it can't be read for every column.
  async selectCell(row, columnName, columnNames) {
    const col = columnNames.indexOf(columnName);
    if (col < 0) {
      throw new Error(`Column ${columnName} not found`);
    }
    await this.selectCellAt(row, col);
  }

  async getTextAtSelectedCell() {
    return this.locators.selectedCell.innerText();
  }
}

module.exports = Grid;
