// Update controller: manual/auto tags, the kept status, install guards and
// error payloads, driven by the fake updater used under NODE_ENV=testing.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createUpdateController,
} = require("../../main/services/updateController");
const {
  createFakeAutoUpdater,
  getState,
} = require("../../main/services/fakeAutoUpdater");

const tick = () => new Promise((resolve) => setImmediate(resolve));

function setup(deps = {}) {
  globalThis.__fakeUpdater = undefined;
  const state = getState();
  const updater = createFakeAutoUpdater();
  let loaded = false;
  const sent = [];
  const controller = createUpdateController({
    getAutoUpdater: () => {
      if (!loaded) {
        loaded = true;
        controller.attach(updater);
      }
      return updater;
    },
    isUpdaterLoaded: () => loaded,
    send: (channel, data) => sent.push({ channel, data }),
    getVersion: () => "1.0.0",
    ...deps,
  });
  const channels = () => sent.map((e) => e.channel);
  return { controller, updater, state, sent, channels };
}

// Silence the expected console.error from failure paths.
test.beforeEach(() => {
  test.mock.method(console, "error", () => {});
});
test.afterEach(() => test.mock.restoreAll());

test("getStatus is null before the updater loads", () => {
  const { controller } = setup();
  assert.equal(controller.getStatus(), null);
});

test("automatic check with no update tags events manual: false", async () => {
  const { controller, sent, state } = setup();
  controller.check({ manual: false });
  await tick();
  assert.equal(state.checks, 1);
  assert.deepEqual(sent, [
    { channel: "checking-for-updates", data: { manual: false } },
    { channel: "update-not-available", data: { manual: false } },
  ]);
  assert.equal(controller.getStatus(), null);
});

test("manual check with an update sends update-ready and keeps it", async () => {
  const { controller, sent, state } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();
  const ready = sent.find((e) => e.channel === "update-ready");
  assert.deepEqual(ready.data, {
    version: "2.0.0",
    currentVersion: "1.0.0",
    channel: "stable",
    releaseName: "2.0.0",
    manual: true,
  });
  assert.deepEqual(controller.getStatus(), ready);
});

test("a nightly version is reported as the nightly channel", async () => {
  const { controller, sent, state } = setup();
  state.next = { version: "2.0.1-nightly.5" };
  controller.check({ manual: false });
  await tick();
  const ready = sent.find((e) => e.channel === "update-ready");
  assert.equal(ready.data.channel, "nightly");
  assert.equal(ready.data.manual, false);
});

test("onUpdateAvailable gets the offered version; onNoUpdate runs when none is found", async () => {
  const available = [];
  let noUpdates = 0;
  const { controller, state } = setup({
    onUpdateAvailable: (data) => available.push(data),
    onNoUpdate: () => noUpdates++,
  });
  state.next = { version: "2.0.1-nightly.5" };
  controller.check({ manual: false });
  await tick();
  assert.deepEqual(available, [
    { version: "2.0.1-nightly.5", currentVersion: "1.0.0", channel: "nightly" },
  ]);
  assert.equal(noUpdates, 0);

  state.next = null;
  controller.check({ manual: true });
  await tick();
  assert.equal(available.length, 1);
  assert.equal(noUpdates, 1);
});

test("a check error calls neither onUpdateAvailable nor onNoUpdate", async () => {
  let calls = 0;
  const { controller, state } = setup({
    onUpdateAvailable: () => calls++,
    onNoUpdate: () => calls++,
  });
  state.next = { error: "offline" };
  controller.check({ manual: true });
  await tick();
  assert.equal(calls, 0);
});

test("a manual check during an automatic one ORs the manual flag", async () => {
  const { controller, sent, state } = setup();
  controller.check({ manual: false });
  controller.check({ manual: true });
  await tick();
  assert.equal(state.checks, 1);
  assert.deepEqual(sent, [
    { channel: "checking-for-updates", data: { manual: false } },
    { channel: "checking-for-updates", data: { manual: true } },
    { channel: "update-not-available", data: { manual: true } },
  ]);
});

test("a new check clears the kept status", async () => {
  const { controller, state } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();
  assert.equal(controller.getStatus().channel, "update-ready");
  state.next = null;
  controller.check({ manual: false });
  await tick();
  assert.equal(controller.getStatus(), null);
});

test("install downloads, keeps each step and quits to install", async () => {
  const { controller, state, channels } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();

  const install = controller.install();
  await tick();
  await install;
  assert.deepEqual(channels().slice(-3), [
    "update-downloading",
    "update-progress",
    "update-downloaded",
  ]);
  assert.equal(controller.getStatus().channel, "update-downloaded");
  assert.equal(state.downloads, 1);
  assert.equal(state.installs, 1);
});

test("update-downloading is the kept status while the download runs", async () => {
  const { controller, updater, state } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();

  let finish;
  updater.downloadUpdate = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const install = controller.install();
  await tick();
  assert.deepEqual(controller.getStatus(), {
    channel: "update-downloading",
    data: undefined,
  });
  finish([]);
  await install;
});

test("a second install during a download is ignored", async () => {
  const { controller, updater, state } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();

  let downloads = 0;
  let finish;
  updater.downloadUpdate = () => {
    downloads++;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const first = controller.install();
  await tick();
  await controller.install();
  assert.equal(downloads, 1);
  finish([]);
  await first;
  // The download finished, so the app is installing: still ignored.
  await controller.install();
  assert.equal(downloads, 1);
});

test("a check during a download doesn't check; a manual one re-sends the download", async () => {
  const { controller, updater, state, sent } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();

  let finish;
  updater.downloadUpdate = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const install = controller.install();
  await tick();
  updater.emit("download-progress", { percent: 40 });

  sent.length = 0;
  controller.check({ manual: false });
  assert.deepEqual(sent, []);
  controller.check({ manual: true });
  assert.deepEqual(sent, [
    { channel: "update-downloading", data: undefined },
    { channel: "update-progress", data: { percent: 40 } },
  ]);
  assert.equal(state.checks, 1);
  // Re-sending doesn't change the kept status.
  assert.equal(controller.getStatus().channel, "update-progress");
  finish([]);
  await install;
});

test("a check error is a plain object with phase check, sent once", async () => {
  const { controller, state, sent } = setup();
  state.next = { error: "offline" };
  controller.check({ manual: false });
  await tick();
  await tick();
  const errors = sent.filter((e) => e.channel === "update-error");
  assert.deepEqual(errors, [
    {
      channel: "update-error",
      data: { message: "offline", manual: false, phase: "check" },
    },
  ]);
  assert.deepEqual(controller.getStatus(), errors[0]);
});

test("a rejected check without an error event still reports once", async () => {
  const { controller, updater, sent } = setup();
  updater.checkForUpdates = () => Promise.reject(new Error("boom"));
  controller.check({ manual: true });
  await tick();
  assert.deepEqual(
    sent.filter((e) => e.channel === "update-error").map((e) => e.data),
    [{ message: "boom", manual: true, phase: "check" }],
  );
});

test("a check that throws synchronously reports the error", () => {
  const { controller, updater, sent } = setup();
  updater.checkForUpdates = () => {
    throw new Error("no config");
  };
  controller.check({ manual: true });
  assert.deepEqual(sent, [
    {
      channel: "update-error",
      data: { message: "no config", manual: true, phase: "check" },
    },
  ]);
});

test("a download error has phase download, is sent once, and allows a retry", async () => {
  const { controller, state, sent } = setup();
  state.next = { version: "2.0.0" };
  controller.check({ manual: false });
  await tick();

  state.downloadError = "disk full";
  await controller.install();
  const errors = sent.filter((e) => e.channel === "update-error");
  assert.deepEqual(
    errors.map((e) => e.data),
    [{ message: "disk full", manual: true, phase: "download" }],
  );
  assert.equal(state.installs, 0);

  state.downloadError = null;
  await controller.install();
  assert.equal(state.downloads, 2);
  assert.equal(state.installs, 1);
});

test("install with no update offered sends a download error", async () => {
  const { controller, state, sent } = setup();
  controller.check({ manual: true });
  await tick();
  await controller.install();
  assert.equal(state.downloads, 0);
  const error = sent.at(-1);
  assert.equal(error.channel, "update-error");
  assert.equal(error.data.phase, "download");
});

test("prepareInstall returning false stops before the download", async () => {
  let prepared = 0;
  const { controller, state, channels } = setup({
    prepareInstall: async () => {
      prepared++;
      return false;
    },
  });
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();
  await controller.install();
  assert.equal(prepared, 1);
  assert.equal(state.downloads, 0);
  assert.ok(!channels().includes("update-downloading"));
  assert.equal(controller.getStatus().channel, "update-ready");

  // Cancelled, so the user can try again.
  await controller.install();
  assert.equal(prepared, 2);
});

test("a second install while prepareInstall waits is ignored", async () => {
  let resolvePrepare;
  let prepared = 0;
  const { controller, state } = setup({
    prepareInstall: () => {
      prepared++;
      return new Promise((resolve) => {
        resolvePrepare = resolve;
      });
    },
  });
  state.next = { version: "2.0.0" };
  controller.check({ manual: true });
  await tick();
  const first = controller.install();
  await controller.install();
  assert.equal(prepared, 1);
  resolvePrepare(true);
  await first;
  assert.equal(state.downloads, 1);
});
