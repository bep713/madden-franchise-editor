const path = require("path");
const { stubOpenDialog } = require("../../util/dialogStubs");
const { poll } = require("../../util/poll");

class WelcomePage {
  constructor(window) {
    this.window = window;
    this.locators = {
      headline: this.window.getByRole("heading", {
        name: "Madden Franchise Editor",
      }),
      getStartedCard: this.window.getByTestId("get-started-card"),
      recentFiles: this.window.getByTestId("recent-files"),
    };
    // The side nav has its own "Open a file..." link
    Object.assign(this.locators, {
      openFileLink: this.locators.getStartedCard.getByText(
        /^Open (a|a different) file\.\.\.$/,
      ),
      tableEditorLink: this.locators.getStartedCard.getByText(
        "Open the table editor",
        { exact: true },
      ),
    });
  }

  async waitForPageLoad() {
    await this.locators.headline.waitFor();
  }

  async getStartedTitle() {
    return (await this.locators.getStartedCard.innerText()).split("\n")[0];
  }

  async waitForOpenFile(filePath) {
    const name = path.basename(filePath);
    await poll(
      () => this.getStartedTitle(),
      (title) => title === name,
      { message: `Get Started card never showed ${name}` },
    );
  }

  // Clicks "Open a file..." without waiting for the file, so a test can
  // answer the common-file prompt first
  async startOpenFile(electronApp, filePath) {
    await stubOpenDialog(electronApp, filePath);
    await this.locators.openFileLink.click();
  }

  async openFranchiseFile(electronApp, filePath) {
    await this.startOpenFile(electronApp, filePath);
    await this.waitForOpenFile(filePath);
  }

  async openTableEditor() {
    await this.locators.tableEditorLink.click();
  }

  // The open file's game icon on the Get Started card, by game shortTitle
  gameIcon(shortTitle) {
    return this.locators.getStartedCard.getByRole("img", {
      name: `${shortTitle} icon`,
    });
  }

  // The Recent Files card for `name` (a file's basename)
  recentFile(name) {
    return this.locators.recentFiles
      .getByText(name, { exact: true })
      .first();
  }
}

module.exports = WelcomePage;
