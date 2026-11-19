const { poll } = require("../../util/poll");

// The bell in Home's headline and the notification drawer it opens
// (Welcome/components/NotificationDrawer)
class NotificationDrawer {
  constructor(window) {
    this.window = window;
    this.locators = {
      bell: window.locator('[data-action="open-notifications"]'),
      badge: window.getByTestId("notification-badge"),
      drawer: window.getByRole("complementary", { name: "Notifications" }),
    };
    Object.assign(this.locators, {
      close: this.locators.drawer.getByRole("button", {
        name: "Close notifications",
      }),
      items: this.locators.drawer.locator("[data-notification-id]"),
      empty: this.locators.drawer.getByText("No notifications", {
        exact: true,
      }),
    });
  }

  async isOpen() {
    return (await this.locators.bell.getAttribute("aria-expanded")) === "true";
  }

  async open() {
    if (!(await this.isOpen())) await this.locators.bell.click();
    await this.locators.drawer.waitFor();
  }

  async close() {
    await this.locators.close.click();
    await this.locators.drawer.waitFor({ state: "detached" });
  }

  // The badge's unread count, 0 without a badge
  async badgeCount() {
    if ((await this.locators.badge.count()) === 0) return 0;
    return Number(await this.locators.badge.getAttribute("data-count"));
  }

  async waitForBadgeCount(count) {
    await poll(
      () => this.badgeCount(),
      (current) => current === count,
      { message: `The badge never showed ${count}` },
    );
  }

  item(id) {
    return this.locators.drawer.locator(`[data-notification-id="${id}"]`);
  }

  // [{ id, kind, read, title, description, time, linkLabel }], newest first
  async items() {
    return this.locators.items.evaluateAll((elements) =>
      elements.map((element) => {
        const field = (name) =>
          element.querySelector(`[data-field="${name}"]`)?.textContent;
        return {
          id: element.getAttribute("data-notification-id"),
          kind: element.getAttribute("data-kind"),
          read: element.getAttribute("data-read") === "true",
          title: field("title"),
          description: field("description"),
          time: field("time"),
          linkLabel: element.querySelector(
            '[data-action="notification-link"]',
          )?.textContent,
        };
      }),
    );
  }

  async waitForItemCount(count) {
    await poll(
      () => this.locators.items.count(),
      (current) => current === count,
      { message: `The drawer never listed ${count} notification(s)` },
    );
  }

  async isEmpty() {
    return (await this.locators.empty.count()) > 0;
  }

  async clickLink(id) {
    await this.item(id).locator('[data-action="notification-link"]').click();
  }

  // A specific link of a notification, by its data-link id
  async clickNotificationLink(id, linkId) {
    await this.item(id)
      .locator(`[data-action="notification-link"][data-link="${linkId}"]`)
      .click();
  }

  // The data-link ids of a notification's links, in order
  async linkIds(id) {
    return this.item(id)
      .locator('[data-action="notification-link"]')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("data-link")),
      );
  }

  async dismiss(id) {
    await this.item(id).locator('[data-action="dismiss-notification"]').click();
  }
}

module.exports = NotificationDrawer;
