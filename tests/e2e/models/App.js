class App {
    constructor(app) {
        this.app = app;
    };

    async getMainWindow() {
        if (!this.mainWindow) {
            const windows = await this.app.windows();

            this.mainWindow = windows.find((window) => {
                return window._mainFrame._url.indexOf('index.html') >= 0;
            });
        }

        return this.mainWindow;
    };

    async closeFile() {
        await this._clickMenuItem('CloseFile');
    };

    async saveFile() {
        await this.mainWindow.evaluate(async () => {
            const { getCurrentWindow } = require('@electron/remote');
            getCurrentWindow().webContents.send('save-file-sync');

            await new Promise((resolve) => {
                let interval = setInterval(() => {
                    if (getCurrentWindow().title.indexOf('Saved') >= 0) {
                        clearInterval(interval);
                        resolve();
                    }
                }, 50);
            });
        });
    };

    async _clickMenuItem(menuItemId) {
        await this.mainWindow.evaluate(async (menuItemId) => {
            const { Menu, getCurrentWindow } = require('@electron/remote');
            Menu.getApplicationMenu().getMenuItemById(menuItemId).click(null, getCurrentWindow());
        }, menuItemId);
    };
};

module.exports = App;