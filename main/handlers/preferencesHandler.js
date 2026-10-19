const { app } = require("electron");
const path = require("path");
const { PreferencesStore } = require("../services/preferencesStore");
const preferencesSchema = require("../../data/preferencesSchema.json");

let preferencesInstance = null;
const changeCallbacks = new Map();

/**
 * Subscribe to changes of a preference made through `preferences:set`.
 * The callback receives (newValue, oldValue). The store has no change events,
 * so the hook lives in the handler.
 */
function onPreferenceChange(keyPath, cb) {
  if (!changeCallbacks.has(keyPath)) {
    changeCallbacks.set(keyPath, []);
  }
  changeCallbacks.get(keyPath).push(cb);
}

/**
 * Initialize the preferences store.
 * Must be called after app is ready.
 */
function initialize() {
  if (preferencesInstance) {
    return preferencesInstance;
  }

  const defaults = getPreferenceDefaults();

  preferencesInstance = new PreferencesStore({
    dataStore: path.resolve(app.getPath("userData"), "preferences.json"),
    defaults: defaults,
  });

  // The store's merge is one level deep, so a key added to a nested section
  // (e.g. a new settingsManager page flag) is still missing. Fill it here,
  // never overwriting a saved value, and write only if something was added.
  const current = preferencesInstance.value(undefined, "");
  if (fillMissingKeys(defaults, current)) {
    preferencesInstance.setMany(Object.entries(current));
  }

  return preferencesInstance;
}

/**
 * Recursively copy keys from `defaults` that are null/undefined in `target`.
 * Same rules as the renderer's setMissingKeys: recurse into plain objects
 * only, never overwrite an existing value. Returns true if anything was filled.
 */
function fillMissingKeys(defaults, target) {
  let changed = false;
  for (const key of Object.keys(defaults)) {
    const defaultValue = defaults[key];
    const current = target[key];
    if (current === null || current === undefined) {
      // A null default over a stored null is not a fill.
      if (current === null && defaultValue === null) continue;
      target[key] = structuredClone(defaultValue);
      changed = true;
    } else if (
      defaultValue !== null &&
      typeof defaultValue === "object" &&
      !Array.isArray(defaultValue) &&
      typeof current === "object" &&
      !Array.isArray(current)
    ) {
      if (fillMissingKeys(defaultValue, current)) changed = true;
    }
  }
  return changed;
}

/**
 * Build the preference sections config (for the settings UI) from the shared schema.
 */
function buildPreferenceSections() {
  return preferencesSchema.sections.map((section) => ({
    id: section.id,
    label: section.label,
    icon: section.icon,
    form: {
      groups: [
        {
          fields: section.fields.map((field) => {
            const base = {
              label: field.label,
              key: field.key,
              type: field.type,
            };
            if (field.help) base.help = field.help;
            if (field.options) base.options = field.options;
            return base;
          }),
        },
      ],
    },
  }));
}

/**
 * Register IPC handlers for preferences operations.
 */
function registerPreferencesHandlers(
  loggedIpc,
  franchiseFileManager = null,
  { loggedMain: getLoggedMain },
) {
  loggedIpc.handle("preferences:get", async () => {
    try {
      if (!preferencesInstance) {
        throw new Error("Preferences not initialized");
      }
      return preferencesInstance.value(undefined, ""); // PreferencesStore quirk: value() with no arguments returns undefined; pass a non-null value to get all prefs.
    } catch (error) {
      throw new Error(`Failed to get preferences: ${error.message}`);
    }
  });

  loggedIpc.handle("preferences:set", async (event, preferences) => {
    try {
      if (!preferencesInstance) {
        throw new Error("Preferences not initialized");
      }
      if (!preferences || typeof preferences !== "object") {
        throw new Error("Invalid preferences object");
      }
      const watchedBefore = new Map();
      for (const keyPath of changeCallbacks.keys()) {
        watchedBefore.set(keyPath, preferencesInstance.value(keyPath));
      }

      // Write each top-level section, saving once
      const entries = [];
      for (const [section, values] of Object.entries(preferences)) {
        if (typeof values === "object" && !Array.isArray(values)) {
          for (const [key, value] of Object.entries(values)) {
            entries.push([`${section}.${key}`, value]);
          }
        }
      }
      if (entries.length > 0) {
        preferencesInstance.setMany(entries);
      }

      if (franchiseFileManager?.applyPreferenceSettings) {
        franchiseFileManager.applyPreferenceSettings(
          preferencesInstance.value(),
        );
      }

      for (const [keyPath, before] of watchedBefore) {
        const after = preferencesInstance.value(keyPath);
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          for (const cb of changeCallbacks.get(keyPath)) {
            try {
              cb(after, before);
            } catch (err) {
              console.error(`Preference change callback failed (${keyPath}):`, err);
            }
          }
        }
      }

      const loggedMain = getLoggedMain();
      loggedMain.send(
        "preferences:update",
        preferencesInstance.value(undefined, ""),
      );

      return true;
    } catch (error) {
      throw new Error(`Failed to set preferences: ${error.message}`);
    }
  });

  loggedIpc.handle("preferences:get-value", async (event, keyPath) => {
    try {
      if (!preferencesInstance) {
        throw new Error("Preferences not initialized");
      }
      return preferencesInstance.value(keyPath);
    } catch (error) {
      throw new Error(
        `Failed to get preference value for '${keyPath}': ${error.message}`,
      );
    }
  });

  loggedIpc.handle("preferences:get-documents-path", async () => {
    try {
      return app.getPath("documents");
    } catch (error) {
      throw new Error(`Failed to get documents path: ${error.message}`);
    }
  });

  loggedIpc.handle("preferences:get-sections", async () => {
    try {
      return buildPreferenceSections();
    } catch (error) {
      throw new Error(`Failed to get preference sections: ${error.message}`);
    }
  });
}

/**
 * Get the default preference values from the shared schema.
 * Resolves dynamic defaults (e.g. documents path) at runtime.
 */
function getPreferenceDefaults() {
  const documentsPath = app
    ? app.getPath("documents")
    : "C:\\Users\\Default\\Documents";

  const defaults = {};
  for (const section of preferencesSchema.sections) {
    defaults[section.id] = {};
    for (const field of section.fields) {
      let value = field.defaultValue;
      // Resolve dynamic default for defaultDirectory
      if (field.key === "defaultDirectory" && value === null) {
        value = path.resolve(documentsPath, "Madden NFL 22\\saves");
      }
      defaults[section.id][field.key] = value;
    }
  }
  // Include settingsManager section (not part of the settings form)
  defaults.settingsManager = preferencesSchema.settingsManager;
  return defaults;
}

/**
 * Get the preferences instance for direct access in main process.
 */
function getPreferencesInstance() {
  return preferencesInstance;
}

module.exports = {
  initialize,
  registerPreferencesHandlers,
  getPreferenceDefaults,
  getPreferencesInstance,
  onPreferenceChange,
};
