// The React jump to column modal (TableEditor/components/JumpToColumnModal).
// Same methods as v4's ColumnJumpModal.
class JumpToColumnModal {
  constructor(window) {
    this.window = window;
    this.dialog = window.getByRole("dialog", { name: "Jump to column" });
    this.locators = {
      column: this.dialog.getByLabel("Column"),
      rowIndex: this.dialog.getByLabel("Row"),
      go: this.dialog.getByRole("button", { name: "Go", exact: true }),
      close: this.dialog.getByRole("button", { name: "Close" }),
    };
  }

  async waitForOpen() {
    await this.dialog.waitFor();
  }

  async waitForClose() {
    await this.dialog.waitFor({ state: "hidden" });
  }

  async isOpen() {
    return this.dialog.isVisible();
  }

  async setColumn(name) {
    await this.locators.column.fill(name);
    await this.dialog.getByRole("button", { name, exact: true }).click();
  }

  async getSelectedColumn() {
    return this.locators.column.inputValue();
  }

  async setRowIndex(row) {
    await this.locators.rowIndex.fill(String(row));
  }

  async getRowIndex() {
    return this.locators.rowIndex.inputValue();
  }

  async go() {
    await this.locators.go.click();
    await this.waitForClose();
  }

  async close() {
    await this.locators.close.click();
    await this.waitForClose();
  }
}

module.exports = JumpToColumnModal;
