const { dismissBanners } = require("../util/banners");
const { withClipboardLock } = require("../util/clipboardLock");
const util = require("../util/UiTestUtil");

class App {
  constructor(app) {
    this.app = app;
  }

  async getMainWindow() {
    if (!this.mainWindow) {
      // Other windows (schema manager, settings) can open too, so pick the
      // main one by its URL.
      const findMain = () =>
        this.app.windows().find((w) => w.url().includes("index.html"));
      const deadline = Date.now() + 30 * 1000;
      let main = findMain();

      while (!main && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        main = findMain();
      }

      if (!main) {
        const urls = this.app.windows().map((w) => w.url());
        throw new Error(
          `Main window (index.html) not found. Open windows: ${JSON.stringify(urls)}`,
        );
      }

      await main.waitForLoadState("domcontentloaded");

      // E2E_WINDOW_SIZE=1024x728 mimics the small CI desktop locally.
      const size = /^(\d+)x(\d+)$/.exec(process.env.E2E_WINDOW_SIZE || "");
      if (size) {
        const browserWindow = await this.app.browserWindow(main);
        await browserWindow.evaluate(
          (win, [width, height]) => win.setSize(width, height),
          [Number(size[1]), Number(size[2])],
        );
      }

      this.mainWindow = main;
    }

    return this.mainWindow;
  }

  async getSettingsManager() {
    // The settings window is created on demand, so poll for it.
    const findSettings = () =>
      this.app.windows().find((window) => window.url().indexOf("settings") >= 0);
    const deadline = Date.now() + 30 * 1000;
    let settings = findSettings();

    while (!settings && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      settings = findSettings();
    }

    return settings;
  }

  async closeFile() {
    await this._clickMenuItem("CloseFile");
  }

  async saveFile() {
    const mainWindow = await this.getMainWindow();
    const fileId = await mainWindow.evaluate(() =>
      window.franchiseAPI.getActiveFileId(),
    );
    await mainWindow.evaluate(
      async (id) => await window.franchiseAPI.saveFile(id),
      fileId,
    );
  }

  async close() {
    await this.app.close();
  }

  // Closes React banners until none is left (util/banners.js)
  async dismissBanners() {
    await dismissBanners(await this.getMainWindow());
  }

  // Copies text and pastes it with a real Ctrl+V into the focused element of
  // window. Holds the clipboard lock until the page has read the clipboard,
  // so parallel workers can't paste each other's text. Returns as soon as
  // the paste event fired, not when the paste has been processed.
  async pasteText(window, text) {
    await withClipboardLock(async () => {
      await window.evaluate(() => {
        window.e2ePasteSeen = false;
        window.addEventListener(
          "paste",
          () => {
            window.e2ePasteSeen = true;
          },
          { capture: true, once: true },
        );
      });
      await this._copyToClipboard(text);
      await util.sendPasteKeyboardShortcut(window);
      await window.waitForFunction(() => window.e2ePasteSeen, null, {
        timeout: 10000,
      });
    });
  }

  // Only call under the clipboard lock (use pasteText)
  async _copyToClipboard(text) {
    // The clipboard lives in the main process
    await this.app.evaluate(({ clipboard }, text) => {
      clipboard.writeText(text);
    }, text);
  }

  // Reads table data straight from the open file (not from the grid)
  async readTable(tableId, fields) {
    const mainWindow = await this.getMainWindow();
    return mainWindow.evaluate(
      async ({ tableId, fields }) => {
        const fileId = await window.franchiseAPI.getActiveFileId();
        return window.franchiseAPI.readTableData(fileId, tableId, fields);
      },
      { tableId, fields },
    );
  }

  async findTableIdByName(tableName) {
    const mainWindow = await this.getMainWindow();
    return mainWindow.evaluate(async (tableName) => {
      const fileId = await window.franchiseAPI.getActiveFileId();
      const tables = await window.franchiseAPI.findTablesByName(
        fileId,
        tableName,
      );
      return tables[0].id;
    }, tableName);
  }

  async isMenuItemEnabled(id) {
    return this.app.evaluate(
      ({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).enabled,
      id,
    );
  }

  // Clicks the item from main, so it works while the main window is reloading
  async clickMenuItem(id) {
    await this.app.evaluate(
      ({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).click(),
      id,
    );
  }

  async isMenuItemChecked(id) {
    return this.app.evaluate(
      ({ Menu }, id) => Menu.getApplicationMenu().getMenuItemById(id).checked,
      id,
    );
  }

  async _clickMenuItem(menuItemId) {
    const mainWindow = await this.getMainWindow();
    await mainWindow.evaluate(
      (id) => window.electronAPI.menu.clickItem(id),
      menuItemId,
    );
  }
}

module.exports = App;
