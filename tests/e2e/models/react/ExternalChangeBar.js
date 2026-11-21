const { poll } = require("../../util/poll");

// The bar under the tabs for a file changed, deleted or moved outside the
// editor (Layout/AutoSavePaused, components/AutoSavePausedStrip)
class ExternalChangeBar {
  constructor(window) {
    this.window = window;
    this.bar = window.getByTestId("auto-save-paused");
  }

  // Waits for the bar; `reason` is its data-reason ("changed" or "missing")
  async waitFor({ reason, timeout = 10000 } = {}) {
    const bar = reason
      ? this.window.locator(`[data-testid="auto-save-paused"][data-reason="${reason}"]`)
      : this.bar;
    await bar.waitFor({ timeout });
  }

  async waitForHidden() {
    await poll(
      () => this.bar.count(),
      (count) => count === 0,
      { message: "The external change bar is still shown" },
    );
  }

  async isVisible() {
    return (await this.bar.count()) > 0;
  }

  async text() {
    return this.bar.innerText();
  }

  // The bar's button labels in order (the X by its aria-label)
  async buttons() {
    return this.bar
      .getByRole("button")
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("aria-label") || el.textContent),
      );
  }

  async click(name) {
    await this.bar.getByRole("button", { name, exact: true }).click();
  }

  async copy() {
    await this.click("Save mine as a copy…");
  }

  async load() {
    await this.click("Load the new version");
  }

  async keep() {
    await this.click("Keep my version");
  }

  async putBack() {
    await this.click("Put it back");
  }

  // The X, shown only with auto-save off
  async hide() {
    await this.bar.locator('[data-action="hide-bar"]').click();
  }
}

module.exports = ExternalChangeBar;
