const { poll } = require("../../util/poll");

// The React tab bar (components/Navigation). "+" isn't a tab.
class NavigationBar {
  constructor(window) {
    this.window = window;
    this.tabs = this.window.locator('[role="tab"][data-name]');
    this.activeTab = this.window.locator(
      '[role="tab"][data-name][aria-selected="true"]',
    );
    this.newTabButton = this.window.getByRole("button", { name: "New tab" });
  }

  tab(name) {
    return this.window.locator(`[role="tab"][data-name="${name}"]`);
  }

  async openTab(name) {
    await this.tab(name).click();
  }

  // Tabs can share a name, so tables opened in new tabs are found by place
  async openLastTab() {
    await this.tabs.last().click();
  }

  async tabNames() {
    return this.tabs.evaluateAll((tabs) =>
      tabs.map((tab) => tab.getAttribute("data-name")),
    );
  }

  async activeTabName() {
    return this.activeTab.getAttribute("data-name");
  }

  // A table tab is renamed once its table loads
  async waitForActiveTab(name) {
    return poll(
      () => this.activeTabName(),
      (active) => active === name,
      { message: `${name} never became the active tab` },
    );
  }

  async openNewTab() {
    await this.newTabButton.click();
  }

  // The close button only shows on hover or on the active tab
  async closeTab(name) {
    const tab = this.tab(name);
    await tab.hover();
    await tab.getByRole("button", { name: "Close tab" }).click();
  }

  async closeActiveTab() {
    await this.activeTab.getByRole("button", { name: "Close tab" }).click();
  }

  async tabCount() {
    return this.tabs.count();
  }

  async hasTab(name) {
    return (await this.tab(name).count()) > 0;
  }

  async hasNewTabButton() {
    return (await this.newTabButton.count()) > 0;
  }
}

module.exports = NavigationBar;
