// main/utils/uiSelection.js: which UI the main window loads.
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  envUiOverride,
  resolveUi,
  uiTarget,
} = require("../../main/utils/uiSelection");

test("envUiOverride", () => {
  assert.equal(envUiOverride({}), null);
  assert.equal(envUiOverride({ MFE_UI: "react" }), "v5");
  assert.equal(envUiOverride({ MFE_UI: "v4" }), "v4");
  assert.equal(envUiOverride({ MFE_UI: "v5" }), null);
  assert.equal(envUiOverride({ MFE_UI: "" }), null);
  assert.equal(envUiOverride({ MFE_RENDERER_URL: "http://127.0.0.1:5173" }), "v5");
  // The dev server URL wins over MFE_UI=v4.
  assert.equal(
    envUiOverride({ MFE_RENDERER_URL: "http://127.0.0.1:5173", MFE_UI: "v4" }),
    "v5",
  );
  assert.equal(envUiOverride({ MFE_RENDERER_URL: "" }), null);
});

test("resolveUi", () => {
  assert.equal(resolveUi({ override: null, preference: "v4" }), "v4");
  assert.equal(resolveUi({ override: null, preference: "v5" }), "v5");
  assert.equal(resolveUi({ override: null, preference: undefined }), "v5");
  assert.equal(resolveUi({ override: null, preference: "bogus" }), "v5");
  assert.equal(resolveUi({ override: "v5", preference: "v4" }), "v5");
  assert.equal(resolveUi({ override: "v4", preference: "v5" }), "v4");
});

test("uiTarget", () => {
  const url = "http://127.0.0.1:5173";
  assert.deepEqual(uiTarget({ ui: "v5", rendererUrl: url, reactBuildExists: false }), {
    ui: "v5",
    url,
  });
  assert.deepEqual(uiTarget({ ui: "v5", reactBuildExists: true }), {
    ui: "v5",
    file: "out/renderer/index.html",
  });
  assert.deepEqual(uiTarget({ ui: "v5", reactBuildExists: false }), {
    ui: "v4",
    file: "renderer/index.html",
    fallback: true,
  });
  assert.deepEqual(uiTarget({ ui: "v4", rendererUrl: url, reactBuildExists: true }), {
    ui: "v4",
    file: "renderer/index.html",
  });
});
