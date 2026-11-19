const { poll } = require("../../util/poll");

// The schema viewer pane on the Schemas page
// (routes/SchemaManagement/components/SchemaViewer)
class SchemaViewer {
  constructor(window) {
    this.window = window;
    this.root = window.getByRole("complementary", { name: "Schema viewer" });
    this.locators = {
      title: this.root.getByRole("heading"),
      close: this.root.getByRole("button", { name: "Close schema viewer" }),
      count: this.root.getByTestId("field-count"),
      clearFilters: this.root.locator('[data-action="clear-filters"]'),
      rows: this.root.locator("[data-field]"),
    };
  }

  async isOpen() {
    return (await this.root.count()) > 0;
  }

  // Open with its first rows shown
  async waitForOpen() {
    await this.root.waitFor();
    await this.locators.count.waitFor();
  }

  async waitForClosed() {
    await this.root.waitFor({ state: "detached" });
  }

  async close() {
    await this.locators.close.click();
    await this.waitForClosed();
  }

  async header() {
    return this.locators.title.innerText();
  }

  async waitForHeader(text) {
    await poll(
      () => this.header(),
      (header) => header === text,
      { message: `The viewer header never became ${text}` },
    );
  }

  // col: "field", "table" or "type"
  filterInput(col) {
    return this.root.locator(`[data-filter="${col}"]`);
  }

  async setFilter(col, text) {
    await this.filterInput(col).fill(text);
  }

  async filterValue(col) {
    return this.filterInput(col).inputValue();
  }

  async clearFilters() {
    await this.locators.clearFilters.click();
  }

  // { shown, total }, from "1,204 of 21,139 fields" or "21,139 fields"
  async count() {
    const text = await this.locators.count.innerText();
    const numbers = (text.match(/[\d,]+/g) || []).map((n) =>
      Number(n.replace(/,/g, "")),
    );
    return numbers.length === 2
      ? { shown: numbers[0], total: numbers[1] }
      : { shown: numbers[0], total: numbers[0] };
  }

  // Polls until the count settles on a value `predicate` accepts (filters
  // apply on a deferred render)
  async waitForCount(predicate, message) {
    return poll(() => this.count(), predicate, { message });
  }

  // The rendered (virtualized) rows, top first
  async rows() {
    return this.locators.rows.evaluateAll((rows) =>
      rows
        .map((row) => ({
          index: Number(row.getAttribute("aria-rowindex")),
          field: row.getAttribute("data-field"),
          table: row.getAttribute("data-table"),
          type: row.getAttribute("data-type"),
        }))
        .sort((a, b) => a.index - b.index)
        .map(({ field, table, type }) => ({ field, table, type })),
    );
  }

  row(i) {
    return this.root.locator(`[aria-rowindex="${i + 2}"]`);
  }

  async clickTable(i) {
    await this.row(i).locator('[data-action="filter-table"]').click();
  }

  // The i-th row with a reference type
  async clickType(i) {
    await this.root.locator('[data-action="jump-type"]').nth(i).click();
  }

  // col: "name", "table" or "type"
  async sortBy(col) {
    await this.root.locator(`[data-sort-column="${col}"]`).click();
  }
}

module.exports = SchemaViewer;
