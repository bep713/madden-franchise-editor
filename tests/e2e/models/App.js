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
};

module.exports = App;