// The React References modal (TableEditor/components/ReferencesModal)
class ReferencesModal {
  constructor(window) {
    this.window = window;
    this.dialog = window.getByRole("dialog", { name: "References" });
    this.rows = this.dialog.locator("button[data-table-id]");
    this.locators = {
      close: this.dialog.getByRole("button", { name: "Close" }),
      loading: this.dialog.getByText("Finding references..."),
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

  // Waits for the scan to finish
  async waitForLoaded() {
    await this.waitForOpen();
    await this.locators.loading.waitFor({ state: "hidden", timeout: 60000 });
  }

  // "The following tables reference (<id>) <name> - Record #<n>:"
  async headerText() {
    return normalize(
      await this.dialog.getByText("The following tables reference").innerText(),
    );
  }

  async hasText(text) {
    return (await this.dialog.getByText(text).count()) > 0;
  }

  // Row texts: "(<tableId>) <name> Record #<n> · <field>"
  async items() {
    const texts = await this.rows.evaluateAll((rows) =>
      rows.map((row) => row.innerText),
    );
    return texts.map(normalize);
  }

  // Each row's { tableId, recordIndex, fieldName }
  async itemTargets() {
    return this.rows.evaluateAll((rows) =>
      rows.map((row) => ({
        tableId: Number(row.dataset.tableId),
        recordIndex: Number(row.dataset.recordIndex),
        fieldName: row.dataset.fieldName,
      })),
    );
  }

  // text: a row's text as returned by items(). options: Playwright click
  // options ({ modifiers }, { button })
  async clickItem(text, options) {
    const texts = await this.items();
    const index = texts.indexOf(text);
    if (index < 0) {
      throw new Error(`Reference "${text}" not found in ${JSON.stringify(texts)}`);
    }
    await this.rows.nth(index).click(options);
  }

  async clickItemAt(index, options) {
    await this.rows.nth(index).click(options);
  }

  async close() {
    await this.locators.close.click();
    await this.waitForClose();
  }
}

function normalize(text) {
  return text.replace(/\s+/g, " ").trim();
}

module.exports = ReferencesModal;
