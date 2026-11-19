// Theme rules for main. Pure so they can be unit tested. Only v5 is themed:
// under v4 everything stays on Electron's defaults.

const THEMES = ["system", "light", "dark"];
const DARK_SURFACE = "#1E1E1E";
const DEFAULT_BACKGROUND = "#FFFFFF";

/** general.theme as stored; unknown values (a hand-edited file) mean Auto. */
function parseThemePreference(value) {
  return THEMES.includes(value) ? value : "system";
}

/** nativeTheme.themeSource for the active UI and the user's theme. */
function themeSourceFor(ui, theme) {
  return ui === "v5" ? parseThemePreference(theme) : "system";
}

/** BrowserWindow background, so a dark page doesn't flash white. */
function windowBackground(ui, dark) {
  return ui === "v5" && dark ? DARK_SURFACE : DEFAULT_BACKGROUND;
}

module.exports = { parseThemePreference, themeSourceFor, windowBackground };
