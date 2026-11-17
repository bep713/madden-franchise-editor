const { poll } = require("../../util/poll");
const { stubOpenDialog } = require("../../util/dialogStubs");

// The React Add schema page (routes/AddSchema), a sub-route of the Schemas tab
class AddSchemaPage {
  constructor(window) {
    this.window = window;
    this.locators = {
      headline: window.getByRole("heading", { name: "Add Schema" }),
      back: window.locator('[data-action="back-to-schemas"]'),
      chooseFiles: window.locator('[data-action="choose-files"]'),
      chooseFolder: window.locator('[data-action="choose-folder"]'),
      rows: window.getByRole("list", { name: "Files" }).locator("li[data-name]"),
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

  // Every row has a role once a plan for the current files has arrived
  async waitForPlan() {
    await poll(
      async () => ({
        rows: await this.locators.rows.count(),
        unplanned: await this.window
          .getByRole("list", { name: "Files" })
          .locator("li[data-name]:not([data-role])")
          .count(),
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

  async rowProblems(name) {
    return this.row(name)
      .locator("[data-problem]")
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-problem")));
  }

  // Expands or collapses a capped list: "files", "missing" or "problems"
  async showMore(what) {
    await this.window.locator(`[data-action="show-more-${what}"]`).click();
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
