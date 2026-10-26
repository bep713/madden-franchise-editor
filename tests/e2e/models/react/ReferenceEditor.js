// The React reference editor popover (components/ReferenceEditor)
class ReferenceEditor {
  constructor(window) {
    this.window = window;
    this.dialog = window.getByRole("dialog", { name: "Edit cell reference" });
    this.locators = {
      table: this.dialog.getByLabel("Table"),
      rowIndex: this.dialog.getByLabel("Row Index"),
      binary: this.dialog.getByLabel("Binary"),
      change: this.dialog.getByRole("button", { name: "Change" }),
      close: this.dialog.getByRole("button", { name: "Close" }),
    };
  }

  async waitForOpen() {
    await this.dialog.waitFor();
  }

  async getSelectedTable() {
    return this.locators.table.inputValue();
  }

  async getRowIndex() {
    return this.locators.rowIndex.inputValue();
  }

  async getBinary() {
    return this.locators.binary.inputValue();
  }

  async setTableById(id) {
    await this.locators.table.fill(String(id));
    await this.dialog
      .getByRole("button", { name: new RegExp(`^${id} - `) })
      .first()
      .click();
  }

  async setRowIndex(row) {
    await this.locators.rowIndex.fill(String(row));
  }

  async change() {
    await this.locators.change.click();
  }

  async close() {
    await this.locators.close.click();
    await this.dialog.waitFor({ state: "hidden" });
  }
}

module.exports = ReferenceEditor;
