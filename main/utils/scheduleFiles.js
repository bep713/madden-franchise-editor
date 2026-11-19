// Historical schedule files (schedules/<year>.json) for the schedule editor's
// Replace all. The renderer passes a filename, so only <4 digits>.json is
// accepted: that rules out "..", separators and absolute paths.

const fs = require("fs");
const path = require("path");

const SCHEDULE_FILE = /^\d{4}\.json$/;

/** Schedule filenames in `dir`, newest first. [] if the dir can't be read. */
function listScheduleFiles(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((name) => SCHEDULE_FILE.test(name))
      .reverse();
  } catch {
    return [];
  }
}

/** Parsed schedule file, or null for a bad name, a missing file or bad JSON. */
function readScheduleFile(dir, filename) {
  if (typeof filename !== "string" || !SCHEDULE_FILE.test(filename)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, filename), "utf-8"));
  } catch {
    return null;
  }
}

module.exports = { listScheduleFiles, readScheduleFile };
