const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');
const preferencesSchema = require('../../../data/preferencesSchema.json');

// Preferences for a fresh test profile: schema defaults, with every settings
// manager page marked as already shown (so no first-run wizard) and the
// background network checks / auto-save off.
const buildTestPreferences = () => {
    const preferences = {};

    for (const section of preferencesSchema.sections) {
        preferences[section.id] = {};
        for (const field of section.fields) {
            preferences[section.id][field.key] = field.defaultValue;
        }
    }

    Object.assign(preferences.general, {
        defaultDirectory: os.tmpdir(),
        checkForUpdates: [],
        checkForSchemaUpdates: [],
        autoSave: [],
        autoUnempty: []
    });

    preferences.settingsManager = JSON.parse(JSON.stringify(preferencesSchema.settingsManager));
    for (const page of Object.values(preferences.settingsManager)) {
        for (const key of Object.keys(page)) {
            page[key] = true;
        }
    }

    return preferences;
};

class Electron {
    constructor() {
        this.electron = null;
        this.userDataDir = null;
    };

    // options.pins: contents to seed pins.json with
    async launchWithDefaultOptions(options = {}) {
        // Each instance gets its own userData so tests never touch the real
        // preferences, pins, recent files or schemas.
        this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfe-e2e-'));
        fs.writeFileSync(
            path.join(this.userDataDir, 'preferences.json'),
            JSON.stringify(buildTestPreferences(), null, 2)
        );
        if (options.pins) {
            fs.writeFileSync(
                path.join(this.userDataDir, 'pins.json'),
                JSON.stringify(options.pins, null, 2)
            );
        }

        this.electron = await electron.launch({
            args: [
                'main.js',
                `--user-data-dir=${this.userDataDir}`,
                // E2E_SCALE=1 mimics the CI display (with E2E_WINDOW_SIZE, see App.js)
                ...(process.env.E2E_SCALE ? [`--force-device-scale-factor=${process.env.E2E_SCALE}`] : [])
            ],
            env: {
                ...process.env,
                'NODE_ENV': 'testing'
            }
        });

        // Saved on failure by the fixture in util/test.js.
        await this.electron.context().tracing.start({ screenshots: true, snapshots: true });

        const userDataDir = this.userDataDir;
        this.electron.on('close', () => {
            try {
                fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 3 });
            } catch (e) { /* best effort */ }
        });

        return this.electron;
    };

    async launch(options) {
        this.electron = await electron.launch(options);
        return this.electron;
    };
};

module.exports = new Electron();
