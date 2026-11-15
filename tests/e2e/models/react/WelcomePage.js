const path = require("path");
const { stubOpenDialog } = require("../../util/dialogStubs");
const { dismissBanners } = require("../../util/banners");
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
      // Next to a common file's name in the card header
      changeFileParametersLink: this.locators.getStartedCard.locator(
        '[data-action="change-file-parameters"]',
      ),
      tableEditorLink: this.locators.getStartedCard.getByText(
        "Open the table editor",
        { exact: true },
      ),
      // Only shown for files with a schedule
      scheduleEditorLink: this.locators.getStartedCard.getByText(
        "Open the schedule editor",
        { exact: true },
      ),
      // Only shown when the open file's path is known
      openFileLocationLink: this.locators.getStartedCard.getByText(
        "Open file location",
        { exact: true },
      ),
    });
    this.locators.switchUiLink = this.window.locator(
      '[data-action="switch-ui"]',
    );
    this.locators.releaseNotesLink = this.window.locator(
      '[data-action="release-notes"]',
    );
    this.locators.settingsLink = this.window.locator(
      '[data-action="settings"]',
    );
    this.locators.sideNavOpenFileLink = this.window.locator(
      '[data-action="open-file"]',
    );
  }

  async waitForPageLoad() {
    await this.locators.headline.waitFor();
  }

  async getStartedTitle() {
    return (await this.locators.getStartedCard.innerText()).split("\n")[0];
  }

  // Also closes the banners the open showed (a schema mismatch overlays the
  // page), unless `keepBanners`
  async waitForOpenFile(filePath, { keepBanners = false } = {}) {
    const name = path.basename(filePath);
    await poll(
      () => this.getStartedTitle(),
      (title) => title === name,
      { message: `Get Started card never showed ${name}` },
    );
    if (!keepBanners) await dismissBanners(this.window);
  }

  // Clicks "Open a file..." without waiting for the file, so a test can
  // answer the common-file prompt first
  async startOpenFile(electronApp, filePath) {
    await stubOpenDialog(electronApp, filePath);
    await this.locators.openFileLink.click();
  }

  async openFranchiseFile(electronApp, filePath, options) {
    await this.startOpenFile(electronApp, filePath);
    await this.waitForOpenFile(filePath, options);
  }

  // Re-opens the common-file prompt for the open file
  async changeFileParameters() {
    await this.locators.changeFileParametersLink.click();
  }

  // Reloads the main window into v4
  async switchToLegacy() {
    await this.locators.switchUiLink.click();
  }

  async openTableEditor() {
    await this.locators.tableEditorLink.click();
  }

  async openScheduleEditor() {
    await this.locators.scheduleEditorLink.click();
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
