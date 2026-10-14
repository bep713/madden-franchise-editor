class App {
  constructor(app) {
    this.app = app;
  }

  async getMainWindow() {
    if (!this.mainWindow) {
      // Wait for the first window to be created using the window event
      this.mainWindow = await this.app.waitForEvent("window");
    }

    return this.mainWindow;
  }

  async getSettingsManager() {
    const windows = await this.app.windows();
    return windows.find((window) => {
      return window.url().indexOf("settings") >= 0;
    });
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
