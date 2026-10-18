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

  async copyToClipboard(text) {
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

  async _clickMenuItem(menuItemId) {
    const mainWindow = await this.getMainWindow();
    await mainWindow.evaluate(
      (id) => window.electronAPI.menu.clickItem(id),
      menuItemId,
    );
  }
}

module.exports = App;
