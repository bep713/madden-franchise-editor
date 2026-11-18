const { poll } = require("../../util/poll");
const { stubOpenDialog } = require("../../util/dialogStubs");

// The React Add schema page (routes/AddSchema), a sub-route of the Schemas tab
class AddSchemaPage {
  constructor(window) {
    this.window = window;
    // exact: the expanded folders' lists are "Files in <folder>"
    const fileList = window.getByRole("list", { name: "Files", exact: true });
    this.locators = {
      headline: window.getByRole("heading", { name: "Add Schema" }),
      back: window.locator('[data-action="back-to-schemas"]'),
      chooseFiles: window.locator('[data-action="choose-files"]'),
      chooseFolder: window.locator('[data-action="choose-folder"]'),
      fileList,
      search: window.locator('input[data-field="file-search"]'),
      removeAll: window.locator('[data-action="remove-all"]'),
      noMatches: window.getByTestId("no-matches"),
      // File rows, top level or inside an expanded folder
      rows: fileList.locator("li[data-name]"),
      folders: fileList.locator("li[data-folder]"),
      stillNeeded: window.getByTestId("still-needed"),
      factsList: window.locator('dl[aria-label="Schema file"]'),
      options: window.getByTestId("schema-options"),
      game: window.locator('select[data-field="game"]'),
      major: window.locator('input[data-field="major"]'),
      minor: window.locator('input[data-field="minor"]'),
      includeDefaults: window.locator('input[data-field="include-defaults"]'),
      advanced: window.getByRole("heading", { name: "Advanced options" }),
      problems: window.getByRole("list", { name: "Problems" }).locator("li[data-problem]"),
      summary: window.getByTestId("add-summary"),
      add: window.locator('[data-action="add"]'),
      submit: window.locator('[aria-busy]:has([data-action="add"])'),
    };
  }

  async waitForPageLoad() {
    await this.locators.headline.waitFor();
  }

  // Picks `paths` in the stubbed open dialog, then waits for main's plan
  async chooseFiles(electronApp, paths) {
    await stubOpenDialog(electronApp, paths);
    await this.locators.chooseFiles.click();
    await this.waitForPlan();
  }

  async chooseFolder(electronApp, folder) {
    await stubOpenDialog(electronApp, folder);
    await this.locators.chooseFolder.click();
    await this.waitForPlan();
  }

  // Every row and folder has a role once a plan for the current files has arrived
  async waitForPlan() {
    const list = this.locators.fileList;
    await poll(
      async () => ({
        rows: await list.locator(":scope > li[data-name], :scope > li[data-folder]").count(),
        unplanned:
          (await list.locator("li[data-name]:not([data-role])").count()) +
          (await list.locator('li[data-folder][data-planned="false"]').count()),
        busy: await this.locators.submit.getAttribute("aria-busy"),
      }),
      ({ rows, unplanned, busy }) => rows > 0 && unplanned === 0 && busy === "false",
      { message: "The plan never arrived" },
    );
  }

  // Waits for a debounced re-plan to start and finish
  async waitForReplan(check) {
    await poll(
      async () =>
        (await this.locators.submit.getAttribute("aria-busy")) === "false" &&
        (await check()),
      (done) => done,
      { message: "The re-plan never showed the change" },
    );
  }

  row(name) {
    return this.locators.rows.and(this.window.locator(`[data-name="${name}"]`));
  }

  async rows() {
    return this.locators.rows.evaluateAll((rows) =>
      rows.map((row) => ({
        name: row.getAttribute("data-name"),
        role: row.getAttribute("data-role"),
      })),
    );
  }

  folder(dir) {
    // JSON quoting escapes the backslashes of a Windows path for CSS
    return this.locators.folders.and(this.window.locator(`[data-folder=${JSON.stringify(dir)}]`));
  }

  async toggleFolder(dir) {
    await this.folder(dir).locator('[data-action="toggle-folder"]').click();
  }

  async removeFolder(dir) {
    await this.folder(dir).locator('[data-action="remove-folder"]').click();
  }

  // Expands every collapsed folder
  async expandFolders() {
    const collapsed = this.locators.fileList.locator(
      '[data-action="toggle-folder"][aria-expanded="false"]',
    );
    while ((await collapsed.count()) > 0) {
      await collapsed.first().click();
    }
  }

  async search(text) {
    await this.locators.search.fill(text);
  }

  async removeAll() {
    await this.locators.removeAll.click();
  }

  // Top-level lines, in order: { folder, count } for a folder, { name } for a file
  async lines() {
    return this.locators.fileList.evaluate((list) =>
      Array.from(list.children).map((li) =>
        li.hasAttribute("data-folder")
          ? {
              folder: li.getAttribute("data-folder"),
              count: Number(li.getAttribute("data-count")),
            }
          : { name: li.getAttribute("data-name") },
      ),
    );
  }

  async folders() {
    return (await this.lines()).filter((line) => line.folder !== undefined);
  }

  async folderText(dir) {
    return this.folder(dir).locator('[data-testid="folder-count"]').innerText();
  }

  async rowProblems(name) {
    return this.row(name)
      .locator("[data-problem]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-problem")));
  }

  // Expands or collapses a capped list: "files", "missing" or "problems"
  async showMore(what) {
    await this.window.locator(`[data-action="show-more-${what}"]`).click();
  }

  // Makes the row the entry, then waits for the re-plan to show it
  async setEntry(name) {
    await this.row(name).locator('[data-action="set-entry"]').click();
    await this.waitForReplan(
      async () => (await this.row(name).getAttribute("data-role")) === "entry",
    );
  }

  // "Use detected" on the chosen entry row
  async resetEntry() {
    await this.locators.fileList.locator('[data-action="reset-entry"]').click();
    await this.waitForReplan(
      async () => (await this.locators.fileList.locator('[data-action="reset-entry"]').count()) === 0,
    );
  }

  async removeFile(name) {
    await this.row(name).locator('[data-action="remove-file"]').click();
  }

  async stillNeeded() {
    if ((await this.locators.stillNeeded.count()) === 0) return [];
    return this.locators.stillNeeded
      .locator("li[data-name]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-name")));
  }

  async hasFacts() {
    return (await this.locators.factsList.count()) > 0;
  }

  async fact(key) {
    return this.locators.factsList.locator(`dd[data-fact="${key}"]`).innerText();
  }

  async hasAdvancedOptions() {
    return (await this.locators.advanced.count()) > 0;
  }

  // Codes of the page-level problems (not the per-row ones)
  async problems() {
    if ((await this.locators.problems.count()) === 0) return [];
    return this.locators.problems.evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-problem")),
    );
  }

  async problemText(code) {
    return this.locators.problems
      .and(this.window.locator(`[data-problem="${code}"]`))
      .innerText();
  }

  // The footer line for a folder whose files have problems
  async folderProblemText(dir) {
    return this.window
      .getByRole("list", { name: "Problems" })
      .locator(`li[data-folder-problems=${JSON.stringify(dir)}]`)
      .innerText();
  }

  async selectGame(label) {
    await this.locators.game.selectOption({ label });
  }

  async selectedGame() {
    return this.locators.game.inputValue();
  }

  async setVersion(major, minor) {
    await this.locators.major.fill(String(major));
    await this.locators.minor.fill(String(minor));
  }

  async setIncludeDefaults(checked) {
    await this.locators.includeDefaults.setChecked(checked);
  }

  async hasDefaultsNote() {
    return (
      (await this.window.locator('[data-problem="defaults-merged-at-load"]').count()) > 0
    );
  }

  async summary() {
    return this.locators.summary.innerText();
  }

  async isAddEnabled() {
    return this.locators.add.isEnabled();
  }

  async clickAdd() {
    await this.locators.add.click();
  }

  async back() {
    await this.locators.back.click();
  }
}

module.exports = AddSchemaPage;
