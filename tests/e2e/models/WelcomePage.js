const util = require("../util/UiTestUtil");

class WelcomePage {
  constructor(window) {
    this.window = window;
    this.locators = {
      openFranchiseFileLink: this.window.locator("#open-file-input"),
      scheduleLink: this.window.locator("#open-schedule"),
      tableEditorLink: this.window.locator("#open-table-editor"),
      schemaViewerLink: this.window.locator("#open-schema-viewer"),
      openDifferentFileLink: this.window.locator("#open-different-file"),
      switchUiLink: this.window.locator('[data-action="switch-ui"]'),
      mostRecentlyOpenedFile: this.window.locator(
        ".load-recent-file > ul > li:first-child .file-item",
      ),
    };
  }

  async waitForPageLoad() {
    await this.window.waitForSelector(".link-item", {
      state: "attached",
    });
  }

  async openFranchiseFile(path) {
    await util.enterFilePath(this.window, "#open-file-input", path);
  }

  // Waits for Welcome to show an open file (its file links)
  async waitForOpenFile() {
    await this.locators.openDifferentFileLink.waitFor({ state: "visible" });
  }

  // Reloads the main window into the React UI
  async switchToNew() {
    await this.locators.switchUiLink.click();
  }

  async openTableEditor() {
    await this.locators.tableEditorLink.click();
  }

  async openScheduleEditor() {
    await this.locators.scheduleLink.click();
  }
}

module.exports = WelcomePage;
