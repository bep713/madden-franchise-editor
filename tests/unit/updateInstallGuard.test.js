// Install guard: the unsaved-changes prompt shown before an update install.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createInstallGuard } = require("../../main/services/updateInstallGuard");

function setup({
  files = { a: { path: "C:/saves/CAREER-A", dirty: false } },
  response = 0,
  saveError = null,
  pendingChange = () => false,
  window = { isDestroyed: () => false },
} = {}) {
  const activeFiles = new Map(
    Object.entries(files).map(([id, f]) => [id, { path: f.path }]),
  );
  const saved = [];
  const boxes = [];
  const manager = {
    activeFiles,
    hasUnsavedChanges: async (id) => files[id].dirty,
    saveFile: async (id) => {
      if (saveError) throw saveError;
      saved.push(id);
    },
  };
  const dialog = {
    showMessageBox: async (...args) => {
      boxes.push(args);
      return { response };
    },
  };
  const guard = createInstallGuard({
    franchiseFileManager: manager,
    getDialog: () => dialog,
    getWindow: () => window,
    hasPendingFileChange: pendingChange,
  });
  const options = (i) => boxes[i][boxes[i].length - 1];
  return { guard, saved, boxes, options };
}

test.beforeEach(() => {
  test.mock.method(console, "error", () => {});
});
test.afterEach(() => test.mock.restoreAll());

test("clean files install without a prompt", async () => {
  const { guard, boxes } = setup();
  assert.equal(await guard.prepareInstall(), true);
  assert.equal(boxes.length, 0);
});

test("no open files install without a prompt", async () => {
  const { guard, boxes } = setup({ files: {} });
  assert.equal(await guard.prepareInstall(), true);
  assert.equal(boxes.length, 0);
});

test("Save and install saves each dirty file", async () => {
  const { guard, saved, boxes, options } = setup({
    files: {
      a: { path: "C:/saves/CAREER-A", dirty: true },
      b: { path: "C:/saves/CAREER-B", dirty: false },
      c: { path: "C:/saves/CAREER-C", dirty: true },
    },
    response: 0,
  });
  assert.equal(await guard.prepareInstall(), true);
  assert.deepEqual(saved, ["a", "c"]);
  assert.equal(boxes.length, 1);
  const opts = options(0);
  assert.deepEqual(opts.buttons, [
    "Save and install",
    "Install without saving",
    "Cancel",
  ]);
  assert.equal(opts.defaultId, 0);
  assert.equal(opts.cancelId, 2);
  assert.match(opts.detail, /CAREER-A, CAREER-C/);
  assert.doesNotMatch(opts.detail, /outside the editor/);
});

test("Install without saving skips the save", async () => {
  const { guard, saved } = setup({
    files: { a: { path: "C:/saves/CAREER-A", dirty: true } },
    response: 1,
  });
  assert.equal(await guard.prepareInstall(), true);
  assert.deepEqual(saved, []);
});

test("Cancel stops the install", async () => {
  const { guard, saved } = setup({
    files: { a: { path: "C:/saves/CAREER-A", dirty: true } },
    response: 2,
  });
  assert.equal(await guard.prepareInstall(), false);
  assert.deepEqual(saved, []);
});

test("a failed save shows an error and stops the install", async () => {
  const { guard, boxes, options } = setup({
    files: { a: { path: "C:/saves/CAREER-A", dirty: true } },
    response: 0,
    saveError: new Error("disk full"),
  });
  assert.equal(await guard.prepareInstall(), false);
  assert.equal(boxes.length, 2);
  assert.equal(options(1).type, "error");
  assert.match(options(1).message, /CAREER-A/);
  assert.equal(options(1).detail, "disk full");
});

test("a pending outside change adds the overwrite warning", async () => {
  const { guard, options } = setup({
    files: { a: { path: "C:/saves/CAREER-A", dirty: true } },
    response: 2,
    pendingChange: (id) => id === "a",
  });
  await guard.prepareInstall();
  assert.match(options(0).detail, /changed outside the editor/);
});

test("the prompt has a parent window only while one exists", async () => {
  const files = { a: { path: "C:/saves/CAREER-A", dirty: true } };
  const win = { isDestroyed: () => false };
  const withWindow = setup({ files, response: 2, window: win });
  await withWindow.guard.prepareInstall();
  assert.equal(withWindow.boxes[0].length, 2);
  assert.equal(withWindow.boxes[0][0], win);

  const noWindow = setup({ files, response: 2, window: null });
  await noWindow.guard.prepareInstall();
  assert.equal(noWindow.boxes[0].length, 1);

  const destroyed = setup({
    files,
    response: 2,
    window: { isDestroyed: () => true },
  });
  await destroyed.guard.prepareInstall();
  assert.equal(destroyed.boxes[0].length, 1);
});
