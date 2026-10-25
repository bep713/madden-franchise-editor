class NavigationBar {
  constructor(window) {
    this.window = window;
    this.tabs = this.window.locator("a[data-name]");
  }

  async openTab(text) {
    await this.window.locator(`a[data-name="${text}"]`).click();
  }

  async tabNames() {
    return this.tabs.evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute("data-name")),
    );
  }
}

module.exports = NavigationBar;
