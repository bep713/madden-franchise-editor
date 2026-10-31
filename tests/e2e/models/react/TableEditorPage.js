const Grid = require("./Grid");
const JumpToColumnModal = require("./JumpToColumnModal");
const App = require("../App");
const { stubOpenDialog, stubSaveDialog } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

class TableEditorPage {
  constructor(window) {
    this.window = window;
    this.grid = new Grid(window);
    this.jumpToColumnModal = new JumpToColumnModal(window);
    this.locators = {
      // Handsontable has its own role="status" announcer
      loader: this.window.locator('[role="status"][aria-busy="true"]'),
      search: this.window.getByPlaceholder("Search tables..."),
      header: this.window.getByTestId("table-header-title"),
      // In either sidebar section
      selectedSidebarTable: this.window.locator(
        'button[data-table-id][aria-current="true"]',
      ),
      pinnedCards: this.window.locator(
        '[data-section="pinned"] button[data-table-id]',
      ),
      pinAction: this.window.locator('[data-action="PIN"]'),
      jumpToColumnAction: this.window.locator(
        '[data-action="JUMP_TO_COLUMN"]',
      ),
      switchOrientationAction: this.window.locator(
        '[data-action="SWITCH_ORIENTATION"]',
      ),
      pinnedToggle: this.window.locator('button[title$="pinned tables"]'),
      backButton: this.window.locator('button[aria-label="Back"]'),
      forwardButton: this.window.locator('button[aria-label="Forward"]'),
      historyMenu: this.window.locator('[role="menu"]'),
      historyMenuItems: this.window.locator(
        '[role="menu"] [role="menuitem"]',
      ),
    };
    // True between a hold-to-open and the mouse release
    this._mouseIsDown = false;
  }

  async clickBack() {
    await this.locators.backButton.click();
  }

  async clickForward() {
    await this.locators.forwardButton.click();
  }

  async isBackEnabled() {
    return this.locators.backButton.isEnabled();
  }

  async isForwardEnabled() {
    return this.locators.forwardButton.isEnabled();
  }

  // HOLD_MS in the app is 500
  async _openHistoryMenu(button, { rightClick = false } = {}) {
    if (rightClick) {
      await button.click({ button: "right" });
    } else {
      // Press and keep holding. pickHistoryItem releases the mouse.
      await button.hover();
      await this.window.mouse.down();
      this._mouseIsDown = true;
      await this.window.waitForTimeout(700);
    }
    await this.locators.historyMenu.waitFor();
  }

  // Hold (default) or right-click the Back button. After a hold the mouse is
  // still down: call pickHistoryItem or releaseMouse.
  async openBackMenu(options) {
    await this._openHistoryMenu(this.locators.backButton, options);
  }

  async openForwardMenu(options) {
    await this._openHistoryMenu(this.locators.forwardButton, options);
  }

  async releaseMouse() {
    if (this._mouseIsDown) {
      this._mouseIsDown = false;
      await this.window.mouse.up();
    }
  }

  // Row texts, nearest first, as "<id> <name>" (just "<id>" if unnamed)
  async historyMenuItems() {
    const texts = await this.locators.historyMenuItems.evaluateAll((items) =>
      items.map((item) => item.innerText),
    );
    return texts.map((text) => text.replace(/\s+/g, " ").trim());
  }

  // text is a row's text as returned by historyMenuItems. After a hold, moves
  // onto the row and releases there (press-drag-release); otherwise clicks it.
  async pickHistoryItem(text) {
    const texts = await this.historyMenuItems();
    const index = texts.indexOf(text);
    if (index < 0) {
      throw new Error(
        `History item "${text}" not found in ${JSON.stringify(texts)}`,
      );
    }
    const item = this.locators.historyMenuItems.nth(index);
    if (this._mouseIsDown) {
      const box = await item.boundingBox();
      await this.window.mouse.move(
        box.x + box.width / 2,
        box.y + box.height / 2,
        { steps: 5 },
      );
      await this.releaseMouse();
    } else {
      await item.click();
    }
  }

  async closeHistoryMenu() {
    await this.releaseMouse();
    await this.window.keyboard.press("Escape");
    await this.locators.historyMenu.waitFor({ state: "hidden" });
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

  // The sidebar is virtualized, so search first instead of scrolling.
  // Pinned tables are only in the Pinned section, so click in either.
  async openTableById(id) {
    await this.locators.search.fill(String(id));
    await this.window
      .locator(`[data-section] button[data-table-id="${id}"]`)
      .click();
    await poll(
      () => this.getSelectedTableName(),
      (name) => name.startsWith(`${id} - `),
      { message: `Table ${id} never loaded` },
    );
    await this.waitForTableToLoad();
  }

  // Opens the table in a new active tab
  async ctrlClickSidebarTable(id) {
    await this.locators.search.fill(String(id));
    await this.sidebarCard(id).click({ modifiers: ["Control"] });
  }

  // Opens the table in a new background tab
  async middleClickSidebarTable(id) {
    await this.locators.search.fill(String(id));
    await this.sidebarCard(id).click({ button: "middle" });
  }

  // section: "all" (the full list) or "pinned"
  sidebarCard(id, section = "all") {
    return this.window.locator(
      `[data-section="${section}"] button[data-table-id="${id}"]`,
    );
  }

  async searchTables(text) {
    await this.locators.search.fill(text);
  }

  // Ids in the Pinned section, top to bottom
  async getPinnedTableIds() {
    const ids = await this.locators.pinnedCards.evaluateAll((cards) =>
      cards.map((card) => Number(card.dataset.tableId)),
    );
    return ids;
  }

  async waitForPinnedTableIds(expected) {
    return poll(
      () => this.getPinnedTableIds(),
      (ids) => JSON.stringify(ids) === JSON.stringify(expected),
      { message: `Pinned section never showed ${JSON.stringify(expected)}` },
    );
  }

  async isCardPinned(id, section = "all") {
    return (
      (await this.sidebarCard(id, section)
        .getByRole("img", { name: "Pinned" })
        .count()) > 0
    );
  }

  async getPinActionText() {
    return (await this.locators.pinAction.innerText()).trim();
  }

  // Pins or unpins the selected table from the action bar
  async togglePinSelectedTable() {
    await this.locators.pinAction.click();
  }

  // The pin/unpin button only shows on hover
  async pinFromSidebar(id, section = "all") {
    await this.clickSidebarPinButton(id, section, /^Pin /);
  }

  async unpinFromSidebar(id, section = "all") {
    await this.clickSidebarPinButton(id, section, /^Unpin /);
  }

  async clickSidebarPinButton(id, section, name) {
    const row = this.window.locator(`[data-section="${section}"]`, {
      has: this.window.locator(`button[data-table-id="${id}"]`),
    });
    await row.hover();
    await row.getByRole("button", { name }).click();
  }

  async togglePinnedSection() {
    await this.locators.pinnedToggle.click();
  }

  async isPinnedSectionToggleOn() {
    return (
      (await this.locators.pinnedToggle.getAttribute("aria-pressed")) ===
      "true"
    );
  }

  async openColumnJumpModal() {
    await this.locators.jumpToColumnAction.click();
    await this.jumpToColumnModal.waitForOpen();
  }

  // Same steps as v4's jumpToColumn. row is a record index.
  async jumpToColumn(column, row) {
    await this.openColumnJumpModal();
    await this.jumpToColumnModal.setColumn(column);
    await this.jumpToColumnModal.setRowIndex(row);
    await this.jumpToColumnModal.go();
  }

  async switchOrientation() {
    const wasInverted = await this.isInverted();
    await this.locators.switchOrientationAction.click();
    await poll(
      () => this.isInverted(),
      (inverted) => inverted !== wasInverted,
      { message: "The orientation never switched" },
    );
  }

  // The inverted grid's columns are "Field Name", then "Record <n>". The
  // header row is virtualized, so the first rendered one may be a record.
  async isInverted() {
    const header = (await this.grid.locators.headers.first().innerText()).trim();
    return header === "Field Name" || /^Record \d+$/.test(header);
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

  // via: "button" (the action bar) or "menu" (File > Export). The file is
  // written after this returns, so wait for it.
  async exportTable(electronApp, filePath, { via = "button" } = {}) {
    await stubSaveDialog(electronApp, filePath);
    if (via === "menu") {
      await new App(electronApp)._clickMenuItem("Export");
    } else {
      await this.window.locator('[data-action="EXPORT"]').click();
    }
  }

  // via: "button" (the action bar) or "menu" (File > Import). Returns once
  // the table has reloaded.
  async importTable(electronApp, filePath, { via = "button" } = {}) {
    await stubOpenDialog(electronApp, filePath);
    await this.watchForLoader();
    if (via === "menu") {
      await new App(electronApp)._clickMenuItem("Import");
    } else {
      await this.window.locator('[data-action="IMPORT"]').click();
    }
    await this.waitForLoaderToShowAndHide();
    await this.waitForTableToLoad();
  }

  // Tools > Export Raw Table
  async exportRawTable(electronApp, filePath) {
    await stubSaveDialog(electronApp, filePath);
    await new App(electronApp)._clickMenuItem("ExportRawTable");
  }

  // Tools > Export FRT File
  async exportFrt(electronApp, filePath) {
    await stubSaveDialog(electronApp, filePath);
    await new App(electronApp)._clickMenuItem("ExportFRT");
  }

  // Tools > Import Raw Table. Returns once the table has reloaded.
  async importRawTable(electronApp, filePath) {
    await stubOpenDialog(electronApp, filePath);
    await this.watchForLoader();
    await new App(electronApp)._clickMenuItem("ImportRawTable");
    await this.waitForLoaderToShowAndHide();
    await this.waitForTableToLoad();
  }
}

module.exports = TableEditorPage;
