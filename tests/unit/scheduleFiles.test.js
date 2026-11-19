// main/utils/scheduleFiles.js: listing and reading schedules/<year>.json.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  listScheduleFiles,
  readScheduleFile,
} = require("../../main/utils/scheduleFiles");

function makeDir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-schedules-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, "2020.json"), JSON.stringify({ year: 2020 }));
  fs.writeFileSync(path.join(dir, "2021.json"), JSON.stringify({ year: 2021 }));
  fs.writeFileSync(path.join(dir, "notes.txt"), "not a schedule");
  return dir;
}

test("listScheduleFiles: schedule files only, newest first", (t) => {
  const dir = makeDir(t);
  assert.deepEqual(listScheduleFiles(dir), ["2021.json", "2020.json"]);
});

test("listScheduleFiles: missing dir", () => {
  assert.deepEqual(
    listScheduleFiles(path.join(os.tmpdir(), "mfe-no-such-dir-xyz")),
    [],
  );
});

test("readScheduleFile: valid name", (t) => {
  const dir = makeDir(t);
  assert.deepEqual(readScheduleFile(dir, "2021.json"), { year: 2021 });
});

test("readScheduleFile: rejects bad names", (t) => {
  const dir = makeDir(t);
  for (const name of [
    "../package.json",
    "..\\x.json",
    "C:\\x.json",
    "2021.JSON",
    "x.json",
    123,
    undefined,
  ]) {
    assert.equal(readScheduleFile(dir, name), null, String(name));
  }
});

test("readScheduleFile: malformed JSON", (t) => {
  const dir = makeDir(t);
  fs.writeFileSync(path.join(dir, "2019.json"), "{ not json");
  assert.equal(readScheduleFile(dir, "2019.json"), null);
});
