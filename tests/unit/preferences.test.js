// Regression tests for preferences: preferencesHandler + PreferencesStore must
// keep electron-preferences' file format and merge rules, so existing
// preferences.json files load and save unchanged.
// fixtures/preferences/real-user.json is a real user's file (username
// replaced); the store must round-trip it byte for byte.
const { setPath, fakeLoggedIpc, fakeLoggedMain } = require("./helpers/electronStub");
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const HANDLER = path.join(ROOT, "main/handlers/preferencesHandler.js");
const UPDATE_CHANNEL = path.join(ROOT, "main/services/updateChannelService.js");

const json = (obj) => JSON.stringify(obj, null, 4) + "\n";

let dir;
test.beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-prefs-test-"));
  setPath("userData", dir);
  setPath("documents", path.join(dir, "documents"));
});
test.afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const prefsFile = () => path.join(dir, "preferences.json");

/** Boot a fresh handler (as on app start) against the current temp dir. */
function boot(inputText = null) {
  if (inputText !== null) fs.writeFileSync(prefsFile(), inputText);
  delete require.cache[require.resolve(HANDLER)];
  delete require.cache[require.resolve(UPDATE_CHANNEL)];
  const handler = require(HANDLER);
  const ipc = fakeLoggedIpc();
  const loggedMain = fakeLoggedMain();
  const origError = console.error;
  console.error = () => {}; // corrupt-file case logs on purpose
  try {
    handler.initialize();
  } finally {
    console.error = origError;
  }
  handler.registerPreferencesHandlers(
    ipc,
    { applyPreferenceSettings() {} },
    { loggedMain: () => loggedMain },
  );
  return { handler, ipc, loggedMain, updateChannel: require(UPDATE_CHANNEL) };
}

test("a real user's file loads and is rewritten unchanged", async () => {
  const input = fs.readFileSync(
    path.join(__dirname, "fixtures/preferences/real-user.json"),
    "utf8",
  );
  const { ipc } = boot(input);
  assert.deepStrictEqual(await ipc.invoke("preferences:get"), JSON.parse(input));
  assert.equal(fs.readFileSync(prefsFile(), "utf8"), input);
});

test("no file: defaults are returned and written with 4-space indent", async () => {
  const { handler, ipc } = boot();
  const defaults = handler.getPreferenceDefaults();
  assert.deepStrictEqual(await ipc.invoke("preferences:get"), defaults);
  assert.equal(fs.readFileSync(prefsFile(), "utf8"), json(defaults));
});

test("corrupt file: falls back to defaults, keeps the file's missing newline", async () => {
  const { handler, ipc } = boot('{"general": ');
  const defaults = handler.getPreferenceDefaults();
  assert.deepStrictEqual(await ipc.invoke("preferences:get"), defaults);
  assert.equal(
    fs.readFileSync(prefsFile(), "utf8"),
    JSON.stringify(defaults, null, 4),
  );
});

test("defaults are merged one level deep", async () => {
  const { handler, ipc } = boot(
    json({
      general: { updateChannel: "nightly", autoSave: [] },
      settingsManager: { appVersions: { "4_0_0": true } },
      legacy: { x: 1 },
    }),
  );
  const defaults = handler.getPreferenceDefaults();
  const prefs = await ipc.invoke("preferences:get");

  // Saved keys win, missing keys in a saved section get their default.
  assert.deepStrictEqual(prefs.general, {
    ...defaults.general,
    updateChannel: "nightly",
    autoSave: [],
  });
  // Missing sections come from the defaults.
  assert.deepStrictEqual(prefs.gameVersions, defaults.gameVersions);
  // Main then fills missing nested keys without touching saved ones.
  assert.deepStrictEqual(prefs.settingsManager.appVersions, {
    ...defaults.settingsManager.appVersions,
    "4_0_0": true,
  });
  assert.deepStrictEqual(prefs.settingsManager.general, defaults.settingsManager.general);
  // Unknown sections are kept.
  assert.deepStrictEqual(prefs.legacy, { x: 1 });
});

/** Count fs.writeFileSync calls made by `fn` (the store writes via a temp file). */
async function countWrites(fn) {
  const orig = fs.writeFileSync;
  let writes = 0;
  fs.writeFileSync = (...args) => {
    writes++;
    return orig.apply(fs, args);
  };
  try {
    await fn();
  } finally {
    fs.writeFileSync = orig;
  }
  return writes;
}

test("an unchanged load does not rewrite the file", async () => {
  boot(); // first launch creates the file
  const before = fs.readFileSync(prefsFile(), "utf8");
  const writes = await countWrites(() => boot());
  assert.equal(writes, 0);
  assert.equal(fs.readFileSync(prefsFile(), "utf8"), before);
});

test("a load that changes something still writes", async () => {
  boot();
  const prefs = JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
  delete prefs.general.autoSave;
  fs.writeFileSync(prefsFile(), json(prefs));
  const writes = await countWrites(() => boot());
  assert.equal(writes, 1);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(prefsFile(), "utf8")).general.autoSave,
    boot().handler.getPreferenceDefaults().general.autoSave,
  );
});

test("a missing nested settingsManager key is filled from the defaults", async () => {
  const { handler } = boot();
  const defaults = handler.getPreferenceDefaults();
  const saved = JSON.parse(fs.readFileSync(prefsFile(), "utf8"));
  saved.settingsManager.appVersions = { "4_0_0": true };
  delete saved.settingsManager.general.autoSaveSet;
  saved.settingsManager.general.defaultEditorSet = true;

  const { ipc } = boot(json(saved));
  const prefs = await ipc.invoke("preferences:get");
  assert.equal(prefs.settingsManager.general.autoSaveSet, false);
  assert.equal(prefs.settingsManager.general.defaultEditorSet, true);
  assert.equal(prefs.settingsManager.appVersions["4_0_0"], true);
  assert.deepStrictEqual(
    Object.keys(prefs.settingsManager.appVersions).sort(),
    Object.keys(defaults.settingsManager.appVersions).sort(),
  );
  // ...and the fill is persisted.
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(prefsFile(), "utf8")), prefs);
});

test("preferences:set writes the file once however many keys it sets", async () => {
  const { ipc } = boot();
  const writes = await countWrites(() =>
    ipc.invoke("preferences:set", {
      general: { autoSave: [], autoUnempty: [] },
      gameVersions: { madden24Directory: "/games/madden24" },
    }),
  );
  assert.equal(writes, 1);
});

test("preferences:set changes only the given keys and survives a restart", async () => {
  const { ipc, loggedMain } = boot();
  const expected = await ipc.invoke("preferences:get");
  expected.general.autoSave = [];

  assert.equal(await ipc.invoke("preferences:set", { general: { autoSave: [] } }), true);
  assert.deepStrictEqual(await ipc.invoke("preferences:get"), expected);
  assert.equal(fs.readFileSync(prefsFile(), "utf8"), json(expected));

  // Other windows are told once, with the full prefs.
  assert.deepStrictEqual(loggedMain.sent, [
    { channel: "preferences:update", args: [expected] },
  ]);

  const restarted = boot();
  assert.deepStrictEqual(await restarted.ipc.invoke("preferences:get"), expected);
});

test("invalid preferences:set input rejects", async () => {
  const { ipc } = boot();
  for (const input of [null, "str", 42]) {
    await assert.rejects(ipc.invoke("preferences:set", input), {
      message: "Failed to set preferences: Invalid preferences object",
    });
  }
});

test("onPreferenceChange fires once per actual change", async () => {
  const { handler, ipc } = boot();
  const calls = [];
  handler.onPreferenceChange("general.updateChannel", (...args) => calls.push(args));

  await ipc.invoke("preferences:set", { general: { autoSave: [] } });
  await ipc.invoke("preferences:set", { general: { updateChannel: "stable" } });
  assert.deepStrictEqual(calls, []);

  await ipc.invoke("preferences:set", { general: { updateChannel: "nightly" } });
  await ipc.invoke("preferences:set", { general: { updateChannel: "nightly" } });
  assert.deepStrictEqual(calls, [["nightly", "stable"]]);
});

test("returned values are copies", async () => {
  const { handler, ipc } = boot();
  const store = handler.getPreferencesInstance();
  store.value("general.checkForUpdates").push("mutated");
  store.value(undefined, "").settingsManager.appVersions["9_9_9"] = true;
  (await ipc.invoke("preferences:get")).general.updateChannel = "mutated";

  assert.deepStrictEqual(store.value("general.checkForUpdates"), [true]);
  assert.equal("9_9_9" in store.value("settingsManager.appVersions"), false);
  assert.equal(store.value("general.updateChannel"), "stable");
});

test("getUpdateChannel reads the stored channel", () => {
  for (const [stored, expected] of [
    ["stable", "stable"],
    ["nightly", "nightly"],
    ["garbage", "stable"],
  ]) {
    const { updateChannel } = boot(json({ general: { updateChannel: stored } }));
    assert.equal(updateChannel.getUpdateChannel(), expected, `stored ${stored}`);
  }
});
