const { _electron: electron } = require('playwright');

class Electron {
    constructor() {
        this.electron = null;
    };

    async launchWithDefaultOptions() {
        this.electron = await electron.launch({
            args: ['main.js'],
            env: {
                'NODE_ENV': 'testing'
            }
        });

        return this.electron;
    };

    async launch(options) {
        this.electron = await electron.launch(options);
        return this.electron;
    };
};

module.exports = new Electron();