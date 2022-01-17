class App {
    constructor(app) {
        this.app = app;
    };

    async getMainWindow() {
        if (!this.mainWindow) {
            const windows = await this.app.windows();

            const titles = await Promise.all(windows.map(async (window) => {
                const title = await window.title();
                return title;
            }));

            const mainWindowIndex = titles.findIndex((title) => {
                return title === 'Madden Franchise Editor';
            });
    
            this.mainWindow = windows[mainWindowIndex];
        }

        return this.mainWindow;
    };
};

module.exports = App;