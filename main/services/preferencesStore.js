const fs = require("fs");
const path = require("path");

/**
 * Small JSON-file preferences store. Replaces electron-preferences and keeps
 * its observable behavior: same load/merge rules, same on-disk format.
 */
class PreferencesStore {
  /**
   * @param {object} options
   * @param {string} options.dataStore Path of the JSON file.
   * @param {object} options.defaults Default values, grouped by section.
   */
  constructor({ dataStore, defaults = {} }) {
    if (!dataStore) {
      throw new Error("The 'dataStore' option is required.");
    }
    this.dataStore = dataStore;
    // Cloned on every read so no caller can mutate the defaults.
    this._defaults = clone(defaults);

    const saved = this._load();
    if (saved) {
      // Merge one level deep: a saved section wins key by key over its
      // defaults, but values inside a key are not merged. Sections that are
      // not in the defaults are kept.
      this._preferences = saved;
      const defaultsCopy = this.defaults;
      for (const section of Object.keys(defaultsCopy)) {
        this._preferences[section] =
          section in saved
            ? { ...defaultsCopy[section], ...saved[section] }
            : defaultsCopy[section];
      }
    } else {
      this._preferences = this.defaults;
    }

    // Only write when the file would change, so a normal launch doesn't
    // rewrite it. A missing or unreadable file counts as changed.
    if (saved === null || this._render() !== this._readText()) {
      this.save();
    }
  }

  get defaults() {
    return clone(this._defaults);
  }

  /**
   * Read the file. Returns null when it is missing, unreadable, not valid
   * JSON or empty/falsy.
   */
  _load() {
    try {
      if (!fs.existsSync(this.dataStore)) {
        return null;
      }
      // Strip a BOM like load-json-file does.
      const text = fs.readFileSync(this.dataStore, "utf8").replace(/^\uFEFF/, "");
      return JSON.parse(text) || null;
    } catch (error) {
      console.error(`Datastore error - ${error}`);
      return null;
    }
  }

  /** The file's raw text, or null when it does not exist. */
  _readText() {
    try {
      return fs.readFileSync(this.dataStore, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      return null;
    }
  }

  /**
   * The text save() writes. Like write-json-file, the trailing newline
   * follows the existing file: kept if it has one, omitted if it does not,
   * added if the file does not exist yet.
   */
  _render() {
    const existing = this._readText();
    const trailingNewline =
      existing !== null && !existing.endsWith("\n") ? "" : "\n";
    return JSON.stringify(this._preferences, null, 4) + trailingNewline;
  }

  /**
   * Write the file synchronously and atomically (temp file + rename), with
   * 4-space indent.
   */
  save() {
    const json = this._render();
    fs.mkdirSync(path.dirname(this.dataStore), { recursive: true });
    const tempFile = `${this.dataStore}.tmp`;
    fs.writeFileSync(tempFile, json);
    fs.renameSync(tempFile, this.dataStore);
  }

  /**
   * - value(key): deep clone of the value at the dot path (undefined if absent).
   * - value(key, v): set the dot path (creating intermediate objects), save.
   * - setMany(entries): set several [key, v] dot paths, save once.
   * - value(undefined, v): deep clone of everything (callers pass "").
   * - value(): undefined (matches electron-preferences; do not rely on it).
   */
  value(key, value) {
    if (key !== undefined && value !== undefined) {
      this._set(key, value);
      this.save();
    } else if (value === undefined) {
      return clone(this._get(key));
    } else {
      return clone(this._preferences);
    }
  }

  setMany(entries) {
    for (const [key, value] of entries) {
      this._set(key, value);
    }
    this.save();
  }

  _get(key) {
    if (key === undefined) {
      return undefined;
    }
    let current = this._preferences;
    for (const part of String(key).split(".")) {
      if (current === null || current === undefined) {
        return undefined;
      }
      current = current[part];
    }
    return current;
  }

  _set(key, value) {
    const parts = String(key).split(".");
    let current = this._preferences;
    for (const part of parts.slice(0, -1)) {
      if (current[part] === null || typeof current[part] !== "object") {
        current[part] = {};
      }
      current = current[part];
    }
    // Store a copy so later changes to the caller's object don't leak in.
    current[parts[parts.length - 1]] = clone(value);
  }
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

module.exports = { PreferencesStore };
