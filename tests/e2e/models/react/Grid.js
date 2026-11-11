const util = require("../../util/UiTestUtil");

// Handsontable 16 version of models/HotComponent.js
class Grid {
  constructor(window) {
    this.window = window;
    this.locators = {
      master: this.window.locator(".ht_master"),
      // :not(.listbox) skips the dropdown editor's own nested grid
      selectedCell: this.window.locator(".ht_master td.current:not(.listbox)"),
      firstCell: this.window.locator(
        ".ht_master tbody tr:nth-of-type(1) td:nth-of-type(1):not(.listbox)",
      ),
      headers: this.window.locator(
        ".ht_clone_top thead tr:last-child th .colHeader",
      ),
    };
  }

  async selectCellAt(row, col) {
    // The corner of the cell, so a reference link in it isn't followed. The
    // first rendered row isn't row 0 once the grid has scrolled, so go to the
    // first cell with Ctrl+Home.
    await this.locators.firstCell.click({ position: { x: 2, y: 2 } });
    await this.window.keyboard.press("Control+Home");

    // Handsontable scrolls virtualized rows and columns into view. Sent
    // without waiting for each key, like v4's HotComponent, since far rows
    // take hundreds of presses.
    const presses = [];
    for (let i = 0; i < col; i++) {
      presses.push(this.window.keyboard.press("ArrowRight"));
    }
    for (let i = 0; i < row; i++) {
      presses.push(this.window.keyboard.press("ArrowDown"));
    }
    await Promise.all(presses);
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

  // Reference links show "<table> - <row>"; the hover edit button has no text
  async getTextAtSelectedCell() {
    // Dropdown cells also show an arrow, as in v4
    return (await this.locators.selectedCell.innerText())
      .replace("▼", "")
      .trim();
  }

  // Same steps as v4's HotComponent: type, commit, back to the edited cell
  async setTextAtSelectedCell(text) {
    await this.window.keyboard.type(text);
    await this.window.keyboard.press("Enter");
    await this.window.keyboard.press("ArrowUp");
  }

  // Opens the dropdown editor (Enter) and clicks an option in its list
  async chooseDropdownOptionAtSelectedCell(option) {
    await this.window.keyboard.press("Enter");
    await this.window
      .locator(".handsontableEditor td", { hasText: new RegExp(`^${option}$`) })
      .first()
      .click();
  }

  async undo() {
    await util.sendUndoKeyboardShortcut(this.window);
  }

  async redo() {
    await util.sendRedoKeyboardShortcut(this.window);
  }

  async isSelectedCellEmpty() {
    const cellClass = await this.locators.selectedCell.getAttribute("class");
    return cellClass.includes("table-cell--empty");
  }

  // options: Playwright click options ({ modifiers }, { button })
  async _clickInSelectedCell(selector, options) {
    await this.locators.selectedCell.hover();
    await this.locators.selectedCell.locator(selector).click(options);
  }

  async editReferenceAtSelectedCell() {
    await this._clickInSelectedCell('[data-action="edit-reference"]');
  }

  async editBlobAtSelectedCell() {
    await this._clickInSelectedCell('[data-action="edit-blob"]');
  }

  // Ctrl or middle-click options open it in a new tab
  async followReferenceAtSelectedCell(options) {
    await this._clickInSelectedCell(
      '[data-action="follow-reference"]',
      options,
    );
  }
}

module.exports = Grid;
