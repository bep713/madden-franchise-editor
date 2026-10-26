const Grid = require("./Grid");
const { stubSaveDialog } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

class TableEditorPage {
  constructor(window) {
    this.window = window;
    this.grid = new Grid(window);
    this.locators = {
      // Handsontable has its own role="status" announcer
      loader: this.window.locator('[role="status"][aria-busy="true"]'),
      search: this.window.getByPlaceholder("Search tables..."),
      header: this.window.getByTestId("table-header-title"),
      selectedSidebarTable: this.window.locator(
        'button[data-table-id][aria-current="true"]',
      ),
    };
  }

  async waitForTableToLoad() {
    await this.locators.loader.waitFor({ state: "hidden" });
    await this.locators.header.waitFor();
    await this.grid.locators.firstCell.waitFor();
  }

  // "<id> - <name>", same format as v4's getSelectedTableName. Unnamed
  // tables show just "<id>".
  async getSelectedTableName() {
    return this.locators.header.innerText();
  }

  selectedSidebarTable() {
    return this.locators.selectedSidebarTable;
  }

  // The sidebar is virtualized, so search first instead of scrolling
  async openTableById(id) {
    await this.locators.search.fill(String(id));
    await this.window.locator(`button[data-table-id="${id}"]`).click();
    await poll(
      () => this.getSelectedTableName(),
      (name) => name.startsWith(`${id} - `),
      { message: `Table ${id} never loaded` },
    );
    await this.waitForTableToLoad();
  }

  // Call before a paste/undo/redo that writes more than one cell, then
  // waitForLoaderToShowAndHide. Remembers if the loader shows even briefly.
  async watchForLoader() {
    await this.window.evaluate(() => {
      window.loaderWasShown = false;
      const isShown = () =>
        !!document.querySelector('[role="status"][aria-busy="true"]');
      const observer = new MutationObserver(() => {
        if (isShown()) {
          window.loaderWasShown = true;
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  // Fails if the loader never appears
  async waitForLoaderToShowAndHide() {
    await this.window.waitForFunction(() => window.loaderWasShown, null, {
      timeout: 30000,
    });
    await this.locators.loader.waitFor({ state: "hidden", timeout: 30000 });
  }

  async exportTable(electronApp, filePath) {
    await stubSaveDialog(electronApp, filePath);
    await this.window.locator('[data-action="EXPORT"]').click();
  }
}

module.exports = TableEditorPage;
