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
    await this.mainWindow.evaluate(async () => {
      const { getCurrentWindow } = require("@electron/remote");
      getCurrentWindow().webContents.send("save-file-sync");

      await new Promise((resolve) => {
        let interval = setInterval(() => {
          if (getCurrentWindow().title.indexOf("Saved") >= 0) {
            clearInterval(interval);
            resolve();
          }
        }, 50);
      });
    });
  }

  async _clickMenuItem(menuItemId) {
    await this.mainWindow.evaluate(async (menuItemId) => {
      const { Menu, getCurrentWindow } = require("@electron/remote");
      Menu.getApplicationMenu()
        .getMenuItemById(menuItemId)
        .click(null, getCurrentWindow());
    }, menuItemId);
  }
}

module.exports = App;
