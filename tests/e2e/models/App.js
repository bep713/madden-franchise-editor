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
    await mainWindow.evaluate((id) => window.franchiseAPI.saveFile(id), fileId);
    await mainWindow.waitForFunction(() => document.title.includes("Saved"), {
      timeout: 5000,
    });
  }

  async _clickMenuItem(menuItemId) {
    const mainWindow = await this.getMainWindow();
    await mainWindow.evaluate((id) => window.electronAPI.menu.clickItem(id));
  }
}

module.exports = App;
