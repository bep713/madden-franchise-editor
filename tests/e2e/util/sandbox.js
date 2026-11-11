const fs = require("fs");
const os = require("os");
const path = require("path");
const FilePaths = require("./FilePaths");

// A temp folder holding a fresh copy of the pristine career file, plus paths
// for export outputs. Each test gets its own, so tests never share a file
// they write and the fixtures in tests/data are never changed.
function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-e2e-sandbox-"));
  const careerPath = path.join(dir, "CAREER-E2ETEST");
  fs.copyFileSync(FilePaths.m22.career.pristine, careerPath);

  return {
    dir,
    careerPath,
    exportPath: path.join(dir, "export.xlsx"),
    rawExportPath: path.join(dir, "raw.dat"),
    frtkExportPath: path.join(dir, "frtk-test.frt"),
  };
}

function removeSandbox(sandbox) {
  try {
    fs.rmSync(sandbox.dir, { recursive: true, force: true, maxRetries: 3 });
  } catch (e) {
    // best effort: an app that is still open may hold the file on Windows
  }
}

module.exports = { makeSandbox, removeSandbox };
