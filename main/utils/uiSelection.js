// Picks which UI the main window loads: v5 (React, src/renderer) or v4
// (legacy, renderer/). Pure so it can be unit tested; main.js supplies the
// env, the preference and whether the React build exists.

const V4_PAGE = "renderer/index.html";
const V5_PAGE = "out/renderer/index.html";

/**
 * UI forced by env vars for this session, or null. MFE_RENDERER_URL (Vite dev
 * server) and MFE_UI=react mean v5, MFE_UI=v4 means v4.
 */
function envUiOverride(env) {
  if (env.MFE_RENDERER_URL || env.MFE_UI === "react") return "v5";
  if (env.MFE_UI === "v4") return "v4";
  return null;
}

/** Override wins; otherwise the preference. Unknown values count as v5. */
function resolveUi({ override, preference }) {
  return override ?? (preference === "v4" ? "v4" : "v5");
}

/**
 * What to load for a UI: { ui, url } or { ui, file }. v5 without a dev server
 * URL or a built out/renderer falls back to v4 with `fallback: true`.
 */
function uiTarget({ ui, rendererUrl, reactBuildExists }) {
  if (ui === "v5") {
    if (rendererUrl) return { ui: "v5", url: rendererUrl };
    if (reactBuildExists) return { ui: "v5", file: V5_PAGE };
    return { ui: "v4", file: V4_PAGE, fallback: true };
  }
  return { ui: "v4", file: V4_PAGE };
}

module.exports = { envUiOverride, resolveUi, uiTarget, V4_PAGE, V5_PAGE };
