const { poll } = require("../../util/poll");

// Slide in/out time (BannerContext SLIDE_MS) plus the 20ms enter delay
const SLIDE_MS = 320;

// The banner at the bottom of the app (components/Banner, BannerContext).
// Only one is mounted at a time.
class Banner {
  constructor(window) {
    this.window = window;
    this.locators = {
      banner: window.getByTestId("banner"),
    };
  }

  // Waits for a banner of `kind` (its data-kind) to finish sliding in
  async waitForBanner(kind, { timeout } = {}) {
    const banner = this.window.locator(`[data-testid="banner"][data-kind="${kind}"]`);
    await banner.waitFor({ timeout });
    await new Promise((resolve) => setTimeout(resolve, SLIDE_MS));
  }

  async isVisible() {
    return (await this.locators.banner.count()) > 0;
  }

  async kind() {
    return this.locators.banner.getAttribute("data-kind");
  }

  async message() {
    return this.locators.banner.locator("p").innerText();
  }

  async click(label) {
    await this.locators.banner
      .getByRole("button", { name: label, exact: true })
      .click();
  }

  async close() {
    await this.click("Close");
  }

  async hover() {
    await this.locators.banner.hover();
  }

  // Waits until no banner is mounted (the slide-out has finished)
  async waitForHidden({ timeout } = {}) {
    await poll(
      () => this.isVisible(),
      (visible) => !visible,
      { timeout, message: "The banner never hid" },
    );
  }
}

module.exports = Banner;
