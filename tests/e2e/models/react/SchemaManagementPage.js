const { poll } = require("../../util/poll");

// The React Schemas page (routes/SchemaManagement)
class SchemaManagementPage {
  constructor(window) {
    this.window = window;
    this.locators = {
      headline: this.window.getByRole("heading", {
        name: "Schema Management",
      }),
      main: this.window.locator("main"),
      actionBar: this.window.getByTestId("schema-action-bar"),
      loadedCard: this.window.getByTestId("loaded-schema"),
      grid: this.window.getByTestId("schema-grid"),
      cards: this.window.getByTestId("schema-grid").getByTestId("schema-card"),
      loader: this.window.locator('[aria-busy="true"]'),
    };
    Object.assign(this.locators, {
      loadedLabel: this.locators.loadedCard.locator('[data-field="loaded"]'),
      expectedLabel: this.locators.loadedCard.locator(
        '[data-field="expected"]',
      ),
      expectedLink: this.locators.loadedCard.locator(
        '[data-action="load-expected"]',
      ),
      status: this.locators.loadedCard.locator("[data-status]"),
    });
  }

  async waitForPageLoad() {
    await this.locators.headline.waitFor();
    // The list loads after the page renders
    await this.locators.cards.first().waitFor();
  }

  row(name) {
    return this.locators.grid.locator(`[data-name="${name}"]`);
  }

  async rowNames() {
    return this.locators.grid
      .locator("[data-name]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-name")));
  }

  async cardTitles() {
    return this.locators.cards.evaluateAll((cards) =>
      cards.map((card) => card.innerText.split("\n")[0]),
    );
  }

  async hasRow(name) {
    return (await this.row(name).count()) > 0;
  }

  async isLink(name) {
    return (await this.row(name).locator("a").count()) > 0;
  }

  async isLoadedRow(name) {
    return (await this.row(name).getAttribute("data-loaded")) !== null;
  }

  async hasDeleteButton(name) {
    return (await this.row(name).locator('[data-action="delete-schema"]').count()) > 0;
  }

  async hasLoadedCard() {
    return (await this.locators.loadedCard.count()) > 0;
  }

  // Starts a load; a confirm box may come first
  async clickSchema(name) {
    await this.row(name).locator("a").click();
  }

  async deleteSchema(name) {
    await this.row(name).locator('[data-action="delete-schema"]').click();
  }

  async refresh() {
    await this.locators.actionBar
      .locator('[data-action="refresh-schemas"]')
      .click();
  }

  async loadedLabel() {
    return this.locators.loadedLabel.innerText();
  }

  async expectedLabel() {
    return this.locators.expectedLabel.innerText();
  }

  async hasExpectedLink() {
    return (await this.locators.expectedLink.count()) > 0;
  }

  async clickExpected() {
    await this.locators.expectedLink.click();
  }

  async status() {
    return this.locators.status.getAttribute("data-status");
  }

  async waitForLoaded(name) {
    await poll(
      async () =>
        (await this.locators.loader.count()) === 0 && (await this.loadedLabel()),
      (label) => label === name,
      { message: `${name} never showed as loaded` },
    );
  }
}

module.exports = SchemaManagementPage;
