#!/usr/bin/env node
// Read-only: is this checkout ready to drive? Checks deps, the M22 fixture,
// build freshness for the React and v4 UIs, and lists Electron processes left
// over from earlier verify/e2e runs. Changes nothing.
//
// Usage: node .claude/skills/verify-mfe/scripts/doctor.js [--ui react|v4]
// Exit 0 = ready, 1 = blocking problem (fix what it prints).

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.resolve(__dirname, "../../../..");
const ui = process.argv.includes("--ui") ? process.argv[process.argv.indexOf("--ui") + 1] : "react";

let blocking = 0;
const ok = (m) => console.log(`OK    ${m}`);
const warn = (m) => console.log(`WARN  ${m}`);
const fail = (m) => { blocking++; console.log(`FAIL  ${m}`); };

function newestMtime(dir, exts) {
  let newest = 0;
  let file = null;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules") walk(p); }
      else if (!exts || exts.some((x) => e.name.endsWith(x))) {
        const m = fs.statSync(p).mtimeMs;
        if (m > newest) { newest = m; file = p; }
      }
    }
  };
  walk(dir);
  return { newest, file };
}

const exists = (rel) => fs.existsSync(path.join(REPO, rel));

// deps
for (const mod of ["playwright", "@playwright/test", "electron", "madden-franchise"]) {
  exists(`node_modules/${mod}/package.json`) ? ok(`node_modules/${mod}`) : fail(`node_modules/${mod} missing: run npm install`);
}
try {
  const v = require(path.join(REPO, "node_modules/electron/package.json")).version;
  ok(`electron ${v}; app version ${require(path.join(REPO, "package.json")).version}`);
} catch { /* reported above */ }

// fixture
exists("tests/data/m22/career/CAREER-M22TEST") ? ok("fixture tests/data/m22/career/CAREER-M22TEST") : fail("fixture CAREER-M22TEST missing");

// builds
const srcExts = [".ts", ".tsx", ".js", ".jsx", ".css", ".scss", ".json", ".svg"];
if (ui === "react") {
  const idx = path.join(REPO, "out/renderer/index.html");
  if (!fs.existsSync(idx)) fail("out/renderer/index.html missing: run npm run build:react");
  else {
    const built = fs.statSync(idx).mtimeMs;
    const src = newestMtime(path.join(REPO, "src"), srcExts);
    const data = newestMtime(path.join(REPO, "data"));
    const newer = [src, data].filter((s) => s.newest > built);
    if (newer.length) fail(`React build is stale (${path.relative(REPO, newer[0].file)} is newer): run npm run build:react`);
    else ok(`React build fresh (${new Date(built).toLocaleString()})`);
  }
} else {
  const bundle = path.join(REPO, "renderer/js/bundle.js");
  const css = path.join(REPO, "renderer/css/app-manifest.css");
  if (!fs.existsSync(bundle)) fail("renderer/js/bundle.js missing: run npm run build:renderer");
  else {
    const built = fs.statSync(bundle).mtimeMs;
    const src = newestMtime(path.join(REPO, "renderer/js"), [".js"]);
    const stale = src.file && !src.file.includes("bundle") && src.newest > built;
    stale ? fail(`v4 bundle stale (${path.relative(REPO, src.file)}): run npm run build:renderer`) : ok("v4 bundle present");
  }
  fs.existsSync(css) ? ok("v4 CSS present") : fail("renderer/css/app-manifest.css missing: run npm run sass:build");
}

// leftovers from earlier runs (never killed here; use cleanup.js)
try {
  const out = process.platform === "win32"
    ? execSync(`powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"Name='electron.exe'\\" | Where-Object { $_.CommandLine -match 'mfe-e2e-' -and $_.CommandLine -notmatch '--type=' } | ForEach-Object { \\"$($_.ProcessId) $($_.CommandLine)\\" }"`, { encoding: "utf8" })
    : execSync(`ps -eo pid,args | grep electron | grep mfe-e2e- | grep -v -- --type= | grep -v grep || true`, { encoding: "utf8" });
  const lines = out.split(/\r?\n/).filter(Boolean);
  if (lines.length) {
    warn(`${lines.length} Electron main process(es) with an mfe-e2e- profile are running (an e2e run in progress, or stranded verify runs):`);
    lines.forEach((l) => console.log(`        ${l.slice(0, 200)}`));
    console.log("        Stranded verify runs: node .claude/skills/verify-mfe/scripts/cleanup.js");
  } else ok("no leftover mfe-e2e Electron processes");
} catch (e) {
  warn(`could not list processes: ${e.message}`);
}

console.log(blocking ? `\nNOT READY (${blocking} blocking)` : "\nREADY");
process.exit(blocking ? 1 : 0);
