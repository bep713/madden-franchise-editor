const path = require("path");
const preferencesSchema = require("../../../data/preferencesSchema.json");

const preferencesService = {
  _cache: null,
};

/**
 * Register an event listener to refresh preference cache on change.
 * If user updates their preferences via preference window, that change
 * will not be reflected in the renderer window preferencesService
 * because there is 1 preferencesService per renderer process.
 */
window.electronAPI.preferences.onPreferencesUpdate((preferences) => {
  preferencesService._cache = preferences;
});

/**
 * Load preferences from main process and cache them.
 * Call this once at app startup.
 */
preferencesService.load = async function () {
  if (!window.electronAPI || !window.electronAPI.preferences) {
    throw new Error("Preferences API not available");
  }
  this._cache = await window.electronAPI.preferences.get();
  return this._cache;
};

/**
 * Get the cached preferences object.
 * Returns null if preferences haven't been loaded yet.
 */
preferencesService.get = function () {
  return this._cache;
};

/**
 * Get a value from the cached preferences by key path (e.g., "general.autoSave").
 * Returns undefined if preferences aren't loaded or the key doesn't exist.
 */
preferencesService.getValue = function (keyPath) {
  if (!this._cache) {
    return undefined;
  }
  const parts = keyPath.split(".");
  let current = this._cache;
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }
  return current;
};

/**
 * Set all preferences in the main process via IPC and update the cache.
 */
preferencesService.setAll = async function (prefs) {
  if (!window.electronAPI || !window.electronAPI.preferences) {
    throw new Error("Preferences API not available");
  }
  if (!prefs || typeof prefs !== "object") {
    throw new Error("Invalid preferences object");
  }
  await window.electronAPI.preferences.set(prefs);
  this._cache = prefs;
  return true;
};

/**
 * Get all preferences from the main process via IPC (fresh fetch, bypasses cache).
 */
preferencesService.getAll = async function () {
  if (!window.electronAPI || !window.electronAPI.preferences) {
    throw new Error("Preferences API not available");
  }
  const prefs = await window.electronAPI.preferences.get();
  this._cache = prefs;
  return prefs;
};

/**
 * Get the documents path from the main process via IPC.
 */
preferencesService.getDocumentsPath = async function () {
  if (!window.electronAPI || !window.electronAPI.preferences) {
    throw new Error("Preferences API not available");
  }
  return window.electronAPI.preferences.getDocumentsPath();
};

/**
 * Returns the default preference schema structure.
 * Derived from the shared preferencesSchema.json — single source of truth.
 * Used by the settings manager to fill in missing keys.
 */
preferencesService.getPreferenceKeys = function () {
  const defaults = {};
  for (const section of preferencesSchema.sections) {
    defaults[section.id] = {};
    for (const field of section.fields) {
      let value = field.defaultValue;
      // Resolve dynamic default for defaultDirectory (relative path for renderer)
      if (field.key === "defaultDirectory" && value === null) {
        value = path.join("Madden NFL 22", "saves");
      }
      defaults[section.id][field.key] = value;
    }
  }
  defaults.settingsManager = preferencesSchema.settingsManager;
  return defaults;
};

module.exports = preferencesService;
