// Summarises a Playwright JSON report: test count, every result sorted by time
// with its status, and per-file sums.
//
//   PLAYWRIGHT_JSON_OUTPUT_NAME=<dir>/results.json npx playwright test --reporter=json
//   node scripts/e2e-timings.js <dir>/results.json
const fs = require("fs");
const path = require("path");

const reportPath = process.argv[2];
if (!reportPath) {
  console.error("Usage: node scripts/e2e-timings.js <results.json>");
  process.exit(1);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const results = [];

function walk(suite, file) {
  file = suite.file || file;
  for (const child of suite.suites || []) walk(child, file);
  for (const spec of suite.specs || []) {
    for (const test of spec.tests) {
      for (const result of test.results) {
        results.push({
          file: file.replace(/\\/g, "/"),
          title: spec.title,
          project: test.projectName,
          ms: result.duration,
          status: result.status,
          retry: result.retry,
        });
      }
    }
  }
}

for (const suite of report.suites) walk(suite, suite.file);

const seconds = (ms) => (ms / 1000).toFixed(1);
const totalMs = results.reduce((sum, r) => sum + r.ms, 0);
const notPassed = results.filter((r) => r.status !== "passed" && r.status !== "skipped");
const wallMs = report.stats && report.stats.duration;

console.log(
  `${results.length} results, ${seconds(totalMs)} s test time` +
    (wallMs ? `, ${seconds(wallMs)} s wall` : "") +
    `, ${notPassed.length} not passed`
);

console.log("\nBy test (slowest first):");
for (const r of [...results].sort((a, b) => b.ms - a.ms)) {
  const retry = r.retry ? ` (retry ${r.retry})` : "";
  console.log(
    `${seconds(r.ms).padStart(7)}  ${r.status.padEnd(9)} ${r.project.padEnd(6)} ${r.file} :: ${r.title}${retry}`
  );
}

console.log("\nBy file:");
const byFile = new Map();
for (const r of results) {
  const entry = byFile.get(r.file) || { ms: 0, count: 0 };
  entry.ms += r.ms;
  entry.count++;
  byFile.set(r.file, entry);
}
for (const [file, { ms, count }] of [...byFile].sort((a, b) => b[1].ms - a[1].ms)) {
  console.log(`${seconds(ms).padStart(7)}  ${String(count).padStart(3)} tests  ${path.posix.normalize(file)}`);
}
