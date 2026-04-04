const { app } = require("electron");
const path = require("path");
const ElectronPreferences = require("electron-preferences");
const preferencesSchema = require("../../data/preferencesSchema.json");

let preferencesInstance = null;

/**
 * Initialize the ElectronPreferences instance.
 * Must be called after app is ready.
 */
function initialize() {
  if (preferencesInstance) {
    return preferencesInstance;
  }

  const defaults = getPreferenceDefaults();

  preferencesInstance = new ElectronPreferences({
    dataStore: path.resolve(app.getPath("userData"), "preferences.json"),
    defaults: defaults,
    sections: buildPreferenceSections(),
  });

  return preferencesInstance;
}

/**
 * Build the ElectronPreferences sections config from the shared schema.
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
function registerPreferencesHandlers(loggedIpc) {
  loggedIpc.handle("preferences:get", async () => {
    try {
      if (!preferencesInstance) {
        throw new Error("Preferences not initialized");
      }
      return preferencesInstance.value();
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
      // Write each top-level section
      for (const [section, values] of Object.entries(preferences)) {
        if (typeof values === "object" && !Array.isArray(values)) {
          for (const [key, value] of Object.entries(values)) {
            preferencesInstance.value(`${section}.${key}`, value);
          }
        }
      }
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
  // Include settingsManager section (not part of ElectronPreferences form)
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
};
