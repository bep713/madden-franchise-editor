const fs = require("fs");
const path = require("path");
const { nativeTheme } = require("electron");
const { themeSourceFor, windowBackground } = require("../utils/theme");

const ROOT = path.join(__dirname, "../..");
const SHARED_CSS_FILES = [
  path.join(ROOT, "data/theme-colors.css"),
  path.join(ROOT, "main/theme/shared-windows.css"),
];

/**
 * Owns every theme side effect in main: nativeTheme.themeSource (title bar,
 * menus, prefers-color-scheme), window backgrounds, and the dark stylesheet
 * injected into the v4 pages that v5 shares (Settings, Schema Manager,
 * Credits). All of it is gated on the active UI, so v4 keeps the defaults.
 */
function createThemeController({ getUi, getTheme }) {
  const windows = new Set();
  // Shared window -> promise of its inserted CSS key, or null.
  const injected = new Map();
  let sharedCss = null;
  let listening = false;

  const readSharedCss = () =>
    (sharedCss ??= SHARED_CSS_FILES.map((f) => fs.readFileSync(f, "utf8")).join(
      "\n",
    ));

  function syncCss(win) {
    if (win.isDestroyed()) return;
    const wc = win.webContents;
    const key = injected.get(win);
    if (getUi() === "v5" && !key) {
      injected.set(win, wc.insertCSS(readSharedCss()));
    } else if (getUi() !== "v5" && key) {
      injected.set(win, null);
      key
        .then((k) => !wc.isDestroyed() && wc.removeInsertedCSS(k))
        .catch(() => {});
    }
  }

  function syncBackgrounds() {
    const color = windowBackground(getUi(), nativeTheme.shouldUseDarkColors);
    for (const win of windows) {
      if (!win.isDestroyed()) win.setBackgroundColor(color);
    }
  }

  function apply() {
    if (!listening) {
      listening = true;
      nativeTheme.on("updated", syncBackgrounds);
    }
    nativeTheme.themeSource = themeSourceFor(getUi(), getTheme());
    syncBackgrounds();
    for (const win of injected.keys()) syncCss(win);
  }

  /** Track a window. `shared` windows are v4 pages that v5 also shows. */
  function track(win, { shared = false } = {}) {
    windows.add(win);
    win.setBackgroundColor(
      windowBackground(getUi(), nativeTheme.shouldUseDarkColors),
    );
    if (shared) {
      injected.set(win, null);
      // A load or reload drops inserted CSS.
      win.webContents.on("did-finish-load", () => {
        injected.set(win, null);
        syncCss(win);
      });
    }
    win.on("closed", () => {
      windows.delete(win);
      injected.delete(win);
    });
  }

  return { apply, track };
}

module.exports = { createThemeController };
