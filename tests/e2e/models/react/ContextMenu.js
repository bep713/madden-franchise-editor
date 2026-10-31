// The grid's right-click menu (Handsontable's context menu). Its classes
// (htContextMenu, htDisabled) are Handsontable's own, not CSS modules.
class ContextMenu {
  constructor(window, grid) {
    this.window = window;
    this.grid = grid;
    this.menus = window.locator(".htContextMenu");
  }

  // Right-clicks the selected cell. Handsontable keeps a multi-cell
  // selection when the click lands inside it.
  async open() {
    // Mid-height: at the top edge, row 0 is under the column header overlay
    const cell = this.grid.locators.selectedCell;
    const box = await cell.boundingBox();
    await cell.click({
      button: "right",
      position: { x: 2, y: Math.round(box.height / 2) },
    });
    await this.menus.first().waitFor();
  }

  async close() {
    // With a submenu open, the first Escape only closes the submenu
    for (let i = 0; i < 3 && (await this.menus.first().isVisible()); i++) {
      await this.window.keyboard.press("Escape");
      await this.window.waitForTimeout(100);
    }
    await this.menus.first().waitFor({ state: "hidden" });
  }

  // The innermost item with this label (submenus are separate .htContextMenu)
  item(label) {
    return this.menus
      .locator("td", { hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*$`) })
      .last();
  }

  async isEnabled(label) {
    const className = (await this.item(label).getAttribute("class")) || "";
    return !className.split(/\s+/).includes("htDisabled");
  }

  async click(label) {
    await this.item(label).click();
  }

  // Hover the "Advanced..." parent, then click the item in its submenu
  async clickAdvanced(label) {
    await this.hoverAdvanced();
    await this.item(label).click();
  }

  async hoverAdvanced() {
    await this.item("Advanced...").hover();
    await this.window
      .locator(".htContextMenu td", { hasText: /Set as next empty record/ })
      .first()
      .waitFor();
  }

  async labels() {
    const texts = await this.menus
      .first()
      .locator("td")
      .evaluateAll((cells) => cells.map((cell) => cell.innerText.trim()));
    return texts.filter(Boolean);
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = ContextMenu;
