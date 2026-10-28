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
      title: this.dialog.getByText("Edit cell reference"),
      tableToggle: this.dialog.getByRole("button", { name: "Toggle options" }),
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

  async toggleTableOptions() {
    await this.locators.tableToggle.click();
  }

  async clickTitle() {
    await this.locators.title.click();
  }

  async clickTableLabel() {
    await this.dialog.getByText("Table", { exact: true }).click();
  }

  async isTableTextSelected() {
    return this.locators.table.evaluate(
      (input) =>
        input.selectionStart === 0 && input.selectionEnd === input.value.length,
    );
  }

  async getHeight() {
    return (await this.dialog.boundingBox()).height;
  }

  async areTableOptionsOpen() {
    return (
      (await this.locators.tableToggle.getAttribute("aria-expanded")) === "true"
    );
  }

  // the option list scrolls instead of growing past its max height
  async isTableOptionListScrollable() {
    return this.dialog
      .getByRole("button", { name: /^\d+ - / })
      .first()
      .evaluate((option) => {
        const list = option.closest("ul").parentElement;
        return list.scrollHeight > list.clientHeight;
      });
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
