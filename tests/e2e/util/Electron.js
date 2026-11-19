const fs = require('fs');
const os = require('os');
const path = require('path');
const { _electron: electron } = require('playwright');
const { test } = require('@playwright/test');
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

// Tracing adds about 20% to test time (measured Nov 2026), so by default it
// only runs on a retry, where a failure gets a trace. E2E_TRACE=1 traces every
// launch. Outside a test (no test.info()) it stays on.
const shouldTrace = () => {
    if (process.env.E2E_TRACE) {
        return true;
    }
    try {
        return test.info().retry > 0;
    } catch (e) {
        return true;
    }
};

const REACT_INDEX = path.join(__dirname, '../../../out/renderer/index.html');

// The UI is picked by the seeded general.uiVersion preference (see
// launchWithDefaultOptions). Drop the env overrides a dev shell may have set
// (see main.js), so they can't switch the UI under test.
const buildLaunchEnv = (extra = {}) => {
    const env = { ...process.env, ...extra, 'NODE_ENV': 'testing' };
    delete env.MFE_RENDERER_URL;
    delete env.MFE_UI;
    return env;
};

class Electron {
    constructor() {
        this.electron = null;
        this.userDataDir = null;
        this.tracing = false;
    };

    // options.pins: contents to seed pins.json with
    // options.ui: "react" loads the built React UI (out/renderer) instead of v4
    // options.preferences: { <section>: { <key>: value } } merged over the
    // test defaults (e.g. { general: { autoUnempty: [true] } })
    // options.env: extra environment variables (e.g. MFE_UPDATE_CHECK_DELAY_MS)
    // options.trace: record a Playwright trace (default: see shouldTrace)
    async launchWithDefaultOptions(options = {}) {
        if (options.ui === 'react' && !fs.existsSync(REACT_INDEX)) {
            throw new Error('out/renderer/index.html missing, run npm run build:react');
        }

        // Each instance gets its own userData so tests never touch the real
        // preferences, pins, recent files or schemas.
        this.userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mfe-e2e-'));
        const preferences = buildTestPreferences();
        preferences.general.uiVersion = options.ui === 'react' ? 'v5' : 'v4';
        for (const [section, values] of Object.entries(options.preferences || {})) {
            preferences[section] = { ...preferences[section], ...values };
        }
        fs.writeFileSync(
            path.join(this.userDataDir, 'preferences.json'),
            JSON.stringify(preferences, null, 2)
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
                // Parallel workers' windows cover each other, and Chromium
                // would throttle the hidden ones' timers and rAF.
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-features=CalculateNativeWinOcclusion',
                // E2E_SCALE=1 mimics the CI display (with E2E_WINDOW_SIZE, see App.js)
                ...(process.env.E2E_SCALE ? [`--force-device-scale-factor=${process.env.E2E_SCALE}`] : [])
            ],
            env: buildLaunchEnv(options.env)
        });

        // Saved on failure by the fixture in util/test.js.
        this.tracing = options.trace ?? shouldTrace();
        if (this.tracing) {
            await this.electron.context().tracing.start({ screenshots: true, snapshots: true });
        }

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
        this.tracing = false;
        return this.electron;
    };
};

module.exports = new Electron();
module.exports.buildTestPreferences = buildTestPreferences;
