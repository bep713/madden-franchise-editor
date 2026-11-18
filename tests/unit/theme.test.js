const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseThemePreference,
  themeSourceFor,
  windowBackground,
} = require("../../main/utils/theme");

test("parseThemePreference keeps known values and turns the rest into system", () => {
  for (const theme of ["system", "light", "dark"]) {
    assert.equal(parseThemePreference(theme), theme);
  }
  for (const bad of [undefined, null, "", "Dark", "blue", ["dark"]]) {
    assert.equal(parseThemePreference(bad), "system");
  }
});

test("themeSourceFor follows the preference on v5 and is system on v4", () => {
  for (const theme of ["system", "light", "dark"]) {
    assert.equal(themeSourceFor("v5", theme), theme);
    assert.equal(themeSourceFor("v4", theme), "system");
  }
  assert.equal(themeSourceFor("v5", "bogus"), "system");
});

test("windowBackground is dark only for v5 in dark colours", () => {
  assert.equal(windowBackground("v5", true), "#1E1E1E");
  assert.equal(windowBackground("v5", false), "#FFFFFF");
  assert.equal(windowBackground("v4", true), "#FFFFFF");
  assert.equal(windowBackground("v4", false), "#FFFFFF");
});
