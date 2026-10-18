#!/usr/bin/env node
// Startup performance harness. Launches the app N times with MFE_PERF=1, collects the
// per-run JSON written by main/services/startupProfiler.js and summarizes it.
// Format and metric definitions: .claude/plans/startup-baseline-contract.md
// Usage: node scripts/perf-startup.js --help
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const RUN_TIMEOUT_MS = 60000;

const HELP = `Usage: node scripts/perf-startup.js [options]

  --runs N            measured runs (default 10)
  --warmup N          discarded warmup runs (default 1)
  --profile temp|real temp = fresh seeded user-data-dir per run (default); real = your actual profile
  --updates on|off    temp profile only: enable update + schema checks (default off)
  --trace             one traced run (MFE_PERF_TRACE=1), no stats
  --label <name>      label used in the output directory name (default "run")
  --exe <path>        packaged exe instead of "electron main.js"

Does not build anything. Run first: npm run sass:build && npm run build:renderer
Output: test/perf-results/<YYYYMMDD-HHmm>-<label>-<sha>/ (run-*.json, summary.json, summary.md)
`;

// ---------------------------------------------------------------- stats helpers

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

function percentile(sorted, p) {
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function stats(values) {
  const v = values.filter(isNum).sort((a, b) => a - b);
  if (!v.length) return { n: 0, median: null, p90: null, min: null };
  return { n: v.length, median: percentile(v, 50), p90: percentile(v, 90), min: v[0] };
}

const fmt = (v, digits = 1) => (isNum(v) ? v.toFixed(digits) : "n/a");

// ---------------------------------------------------------------- run JSON accessors

const MANDATORY_MAIN_MARKS = [
  "main:module-start", "main:requires-done", "main:ready", "main:create-window-start",
  "main:menu-done", "main:main-window-created", "main:worker-window-created",
  "main:prefs-init-start", "main:prefs-init-end", "main:schema-window-created",
  "main:settings-window-created", "main:create-window-end"
];
const MANDATORY_RENDERER_MARKS = [
  "renderer:bundle-tag", "renderer:bundle-start", "renderer:prefs-loaded",
  "renderer:editors-load-start", "renderer:editors-load-end", "renderer:welcome-html-requested",
  "renderer:update-prompt-check", "renderer:welcome-visible", "renderer:welcome-interactive",
  "renderer:recent-files-rendered"
];
const MANDATORY_MARKS = [...MANDATORY_MAIN_MARKS, ...MANDATORY_RENDERER_MARKS];

function markT(run, name) {
  const marks = Array.isArray(run && run.marks) ? run.marks : [];
  const m = marks.find((x) => x && x.name === name && isNum(x.t));
  return m ? m.t : null;
}

const diff = (a, b) => (isNum(a) && isNum(b) ? a - b : null);

function wasHidden(run) {
  return markT(run, "renderer:page-hidden") !== null;
}

function missingMarks(run) {
  return MANDATORY_MARKS.filter((n) => markT(run, n) === null);
}

const FONT_RE = /fonts\.(googleapis|gstatic)\.com/;

// Metric groups (shown in this order after the headline block).
// Returns { key: { label, value, group, unit } } for a single run. Missing values are null.
function computeRunMetrics(run, extra = {}) {
  const out = {};
  const add = (key, label, value, group, unit = "ms") => { out[key] = { label, value: isNum(value) ? value : null, group, unit }; };
  const spawnT = isNum(run.spawnT) ? run.spawnT : (isNum(extra.spawnT) ? extra.spawnT : null);
  const mt = (n) => markT(run, n);
  const win = (run.windows && run.windows.main) || {};
  const r = (run.renderer && run.renderer.main) || {};

  // M1
  add("M1.spawnToModuleStart", "Spawn -> main module start", diff(mt("main:module-start"), spawnT), "M1");
  // M2
  add("M2.requiresTotal", "Main requires total", run.requires && run.requires.totalMs, "M2");
  // M3
  add("M3.moduleStartToReady", "Module start -> ready", diff(mt("main:ready"), mt("main:module-start")), "M3");
  add("M3.readyToCreateWindowStart", "Ready -> createWindow start", diff(mt("main:create-window-start"), mt("main:ready")), "M3");
  add("M3.createWindowDuration", "createWindow duration", diff(mt("main:create-window-end"), mt("main:create-window-start")), "M3");
  // M4
  add("M4.menu", "createWindow: menu", diff(mt("main:menu-done"), mt("main:create-window-start")), "M4");
  add("M4.mainWindow", "createWindow: main window", diff(mt("main:main-window-created"), mt("main:menu-done")), "M4");
  add("M4.workerWindow", "createWindow: worker window", diff(mt("main:worker-window-created"), mt("main:main-window-created")), "M4");
  add("M4.prefsInit", "createWindow: preferences init", diff(mt("main:prefs-init-end"), mt("main:prefs-init-start")), "M4");
  add("M4.schemaWindow", "createWindow: schema window", diff(mt("main:schema-window-created"), mt("main:prefs-init-end")), "M4");
  add("M4.settingsWindow", "createWindow: settings window", diff(mt("main:settings-window-created"), mt("main:schema-window-created")), "M4");
  // M5
  add("M5.eventLoopMax", "Main event-loop delay max", run.eventLoop && run.eventLoop.maxMs, "M5");
  add("M5.eventLoopP99", "Main event-loop delay p99", run.eventLoop && run.eventLoop.p99Ms, "M5");
  // M6
  for (const name of ["main", "worker", "schema", "settings"]) {
    const w = (run.windows && run.windows[name]) || {};
    add(`M6.${name}`, `did-finish-load - created (${name})`, diff(w.didFinishLoad, w.created), "M6");
  }
  // M7
  const byType = {};
  for (const p of Array.isArray(run.appMetrics) ? run.appMetrics : []) {
    const t = p.type || "Unknown";
    byType[t] = byType[t] || { cpu: 0, mem: 0, has: false };
    // percentCPUUsage is 0 on the first getAppMetrics() call; cumulativeCPUUsage is CPU seconds since process start
    if (p.cpu && isNum(p.cpu.cumulativeCPUUsage)) byType[t].cpu += p.cpu.cumulativeCPUUsage * 1000;
    if (p.memory && isNum(p.memory.workingSetSize)) byType[t].mem += p.memory.workingSetSize;
    byType[t].has = true;
  }
  for (const t of Object.keys(byType).sort()) {
    add(`M7.cpu.${t}`, `CPU time (${t}, sum)`, byType[t].cpu, "M7", "ms");
    add(`M7.mem.${t}`, `Working set (${t}, sum)`, byType[t].mem / 1024, "M7", "MB");
  }
  // M8
  const paint = Array.isArray(r.paint) ? r.paint : [];
  const paintT = (n) => { const e = paint.find((x) => x.name === n); return e ? e.t : null; };
  add("M8.firstPaint", "First paint - main window created", diff(paintT("first-paint"), win.created), "M8");
  add("M8.fcp", "First contentful paint - main window created", diff(paintT("first-contentful-paint"), win.created), "M8");
  // M9, M10
  add("M9.bundleParseEval", "Bundle tag -> bundle start", diff(mt("renderer:bundle-start"), mt("renderer:bundle-tag")), "M9");
  add("M10.editorsLoad", "Editors load (require navigationService)", diff(mt("renderer:editors-load-end"), mt("renderer:editors-load-start")), "M10");
  // M11
  const fonts = (Array.isArray(r.resources) ? r.resources : []).filter((x) => x && FONT_RE.test(x.name || "") && isNum(x.duration));
  add("M11.fontsSum", "Google Fonts requests: sum", fonts.length ? fonts.reduce((s, x) => s + x.duration, 0) : (Array.isArray(r.resources) ? 0 : null), "M11");
  add("M11.fontsMax", "Google Fonts requests: max", fonts.length ? Math.max(...fonts.map((x) => x.duration)) : (Array.isArray(r.resources) ? 0 : null), "M11");
  // M12
  for (const [k, mark, label] of [
    ["welcomeVisible", "renderer:welcome-visible", "Welcome visible"],
    ["welcomeInteractive", "renderer:welcome-interactive", "Welcome interactive"],
    ["recentFilesRendered", "renderer:recent-files-rendered", "Recent files rendered"]
  ]) {
    add(`M12.${k}`, `${label} - main window created`, diff(mt(mark), win.created), "M12");
    add(`M12.${k}FromSpawn`, `${label} - spawn`, diff(mt(mark), spawnT), "M12");
  }
  // M13
  const lts = Array.isArray(r.longtasks) ? r.longtasks : null;
  add("M13.count", "Long tasks: count", lts ? lts.length : null, "M13", "");
  add("M13.total", "Long tasks: total duration", lts ? lts.reduce((s, x) => s + (x.duration || 0), 0) : null, "M13");
  // M14
  const pr = r.prefsRace || {};
  add("M14.margin", "Prefs loaded -> update-prompt check (margin)", diff(pr.checkT, pr.prefsLoadedT), "M14");
  add("M14.prefsLoadedAtCheck", "Prefs loaded at check (1=yes)", typeof pr.prefsLoadedAtCheck === "boolean" ? (pr.prefsLoadedAtCheck ? 1 : 0) : null, "M14", "");
  // Headline: time to window = spawn -> createWindow end (M1 + M3)
  add("H.timeToWindow", "Time to window (spawn -> createWindow end)", diff(mt("main:create-window-end"), spawnT), "H");
  return out;
}

const HEADLINE_KEYS = [
  "H.timeToWindow", "M8.fcp", "M12.welcomeInteractive", "M12.recentFilesRendered", "M5.eventLoopMax"
];

// M16 sizes (bytes) -> { name: bytes|null }
function bundleSizes(root = ROOT) {
  const files = ["renderer/js/bundle.js", "renderer/js/schemaManager.bundle.js",
    "renderer/js/settingsManager.bundle.js", "renderer/js/worker.bundle.js", "renderer/css/app-manifest.css"];
  const out = {};
  for (const f of files) {
    try { out[f] = fs.statSync(path.join(root, f)).size; } catch (e) { out[f] = null; }
  }
  return out;
}

function median(arr) {
  const v = arr.filter(isNum).sort((a, b) => a - b);
  return percentile(v, 50);
}

/**
 * Pure summary logic.
 * @param {object[]} runs  measured run JSONs in launch order (warmups already excluded);
 *                         a null entry means the run produced no JSON.
 * @param {object} opts    { label, sizes, spawnTs: [..] (per run, fallback), warmupCount }
 * @returns {{ summary: object, markdown: string }}
 */
function summarize(runs, opts = {}) {
  const sizes = opts.sizes || {};
  // Runs where the main window was hidden (screen off/locked, occluded) are
  // throttled by Chromium and not comparable, so they are left out of stats.
  const valid = runs.map((r, i) => ({ r, i })).filter((x) => x.r && !wasHidden(x.r));
  const perRun = valid.map(({ r, i }) => computeRunMetrics(r, { spawnT: opts.spawnTs && opts.spawnTs[i] }));

  const keys = [];
  const meta = {};
  for (const m of perRun) {
    for (const [k, v] of Object.entries(m)) {
      if (!meta[k]) { meta[k] = { label: v.label, group: v.group, unit: v.unit }; keys.push(k); }
    }
  }
  const metrics = {};
  for (const k of keys) {
    const vals = perRun.map((m) => (m[k] ? m[k].value : null));
    metrics[k] = { ...meta[k], ...stats(vals), values: vals };
  }
  const coldish = perRun.length
    ? Object.fromEntries(keys.map((k) => [k, perRun[0][k] ? perRun[0][k].value : null]))
    : {};

  // M2 top requires: median of ms per (kind,name) across runs where present
  const reqAgg = new Map();
  for (const { r } of valid) {
    const entries = (r.requires && Array.isArray(r.requires.entries)) ? r.requires.entries : [];
    for (const e of entries) {
      if (!isNum(e.ms)) continue;
      const key = `${e.kind}:${e.name}`;
      if (!reqAgg.has(key)) reqAgg.set(key, { kind: e.kind, name: e.name, parent: e.parent, ms: [] });
      reqAgg.get(key).ms.push(e.ms);
    }
  }
  const topRequires = [...reqAgg.values()]
    .map((e) => ({ kind: e.kind, name: e.name, parent: e.parent, medianMs: median(e.ms), runs: e.ms.length }))
    .sort((a, b) => b.medianMs - a.medianMs).slice(0, 10);

  // M13 top 5 long tasks across measured runs
  const longTasks = [];
  for (const { r, i } of valid) {
    const lts = r.renderer && r.renderer.main && r.renderer.main.longtasks;
    const win = r.windows && r.windows.main && r.windows.main.created;
    for (const lt of Array.isArray(lts) ? lts : []) {
      if (isNum(lt.duration)) longTasks.push({ run: i, duration: lt.duration, afterWindowCreatedMs: diff(lt.t, win) });
    }
  }
  longTasks.sort((a, b) => b.duration - a.duration);
  const topLongTasks = longTasks.slice(0, 5);

  // M15 ipc: median across runs of count/total/max per channel
  const ipcAgg = new Map();
  for (const { r } of valid) {
    for (const [ch, v] of Object.entries(r.ipc || {})) {
      if (!ipcAgg.has(ch)) ipcAgg.set(ch, { count: [], totalMs: [], maxMs: [] });
      const a = ipcAgg.get(ch);
      a.count.push(v.count); a.totalMs.push(v.totalMs); a.maxMs.push(v.maxMs);
    }
  }
  const ipc = [...ipcAgg.entries()]
    .map(([channel, a]) => ({ channel, count: median(a.count), totalMs: median(a.totalMs), maxMs: median(a.maxMs), runs: a.count.length }))
    .sort((a, b) => (b.totalMs || 0) - (a.totalMs || 0));

  const perRunStatus = runs.map((r, i) => (r ? {
    run: i,
    timedOut: !!r.timedOut,
    hidden: wasHidden(r),
    missingMarks: missingMarks(r)
  } : { run: i, noJson: true, timedOut: null, hidden: null, missingMarks: MANDATORY_MARKS.slice() }));
  const timedOutCount = perRunStatus.filter((s) => s.timedOut).length;
  const hiddenCount = perRunStatus.filter((s) => s.hidden).length;

  const summary = {
    label: opts.label || "run",
    runsRequested: runs.length,
    runsWithJson: valid.length,
    timedOutCount,
    hiddenCount,
    metrics,
    coldish,
    topRequires,
    topLongTasks,
    ipc,
    sizes,
    perRunStatus
  };

  // ---- markdown
  const L = [];
  const row = (k) => {
    const m = metrics[k];
    if (!m) return `| ${k} | n/a | n/a | n/a | n/a | n/a |`;
    const u = m.unit ? ` ${m.unit}` : "";
    const f = (v) => (isNum(v) ? `${fmt(v)}${u}` : "n/a");
    return `| ${m.label} | ${f(m.median)} | ${f(m.p90)} | ${f(m.min)} | ${f(coldish[k])} | ${m.n}/${runs.length} |`;
  };
  const head = ["| Metric | median | p90 | min | cold-ish (1st measured) | n |", "|---|---|---|---|---|---|"];
  L.push(`# Startup perf summary: ${summary.label}`, "");
  L.push(`Measured runs: ${runs.length} (used: ${valid.length}), timed out: ${timedOutCount}, window hidden (excluded): ${hiddenCount}. Warmup runs excluded.`, "");
  L.push("## Headline", "", ...head);
  for (const k of HEADLINE_KEYS) L.push(row(k));
  L.push("");
  const groupNames = { M1: "M1 Spawn to main", M2: "M2 Main requires", M3: "M3 Main boot", M4: "M4 createWindow steps",
    M5: "M5 Event loop", M6: "M6 Window load", M7: "M7 Process CPU / memory", M8: "M8 Paint", M9: "M9 Bundle parse+eval",
    M10: "M10 Editor load", M11: "M11 Google Fonts", M12: "M12 Welcome", M13: "M13 Long tasks", M14: "M14 Prefs race" };
  for (const [g, title] of Object.entries(groupNames)) {
    const ks = keys.filter((k) => meta[k].group === g);
    if (!ks.length) { L.push(`## ${title}`, "", "n/a", ""); continue; }
    L.push(`## ${title}`, "", ...head, ...ks.map(row), "");
  }
  L.push("## M2 Top 10 main requires (median inclusive ms)", "");
  if (topRequires.length) {
    L.push("| # | kind | name | parent | median ms | runs |", "|---|---|---|---|---|---|");
    topRequires.forEach((e, i) => L.push(`| ${i + 1} | ${e.kind} | ${e.name} | ${e.parent || "n/a"} | ${fmt(e.medianMs)} | ${e.runs} |`));
  } else L.push("n/a");
  L.push("", "## M13 Top 5 long tasks (main window, all measured runs)", "");
  if (topLongTasks.length) {
    L.push("| # | run | duration ms | after window created ms |", "|---|---|---|---|");
    topLongTasks.forEach((t, i) => L.push(`| ${i + 1} | ${t.run} | ${fmt(t.duration)} | ${fmt(t.afterWindowCreatedMs)} |`));
  } else L.push("n/a");
  L.push("", "## M15 IPC per channel (median across runs)", "");
  if (ipc.length) {
    L.push("| channel | count | total ms | max ms | runs |", "|---|---|---|---|---|");
    ipc.forEach((c) => L.push(`| ${c.channel} | ${fmt(c.count, 0)} | ${fmt(c.totalMs, 2)} | ${fmt(c.maxMs, 2)} | ${c.runs} |`));
  } else L.push("n/a");
  L.push("", "## M16 Bundle sizes", "", "| file | KB |", "|---|---|");
  for (const [f, b] of Object.entries(sizes)) L.push(`| ${f} | ${isNum(b) ? (b / 1024).toFixed(1) : "n/a"} |`);
  if (!Object.keys(sizes).length) L.push("| n/a | n/a |");
  L.push("", "## Per-run status", "", `Timed out runs: ${timedOutCount}`, "");
  L.push("| run | timedOut | hidden | missing mandatory marks |", "|---|---|---|---|");
  for (const s of perRunStatus) {
    const miss = s.noJson ? "no JSON written" : (s.missingMarks.length ? s.missingMarks.join(", ") : "none");
    const na = (v) => (v === null ? "n/a" : v);
    L.push(`| ${s.run} | ${na(s.timedOut)} | ${na(s.hidden)} | ${miss} |`);
  }
  L.push("");
  return { summary, markdown: L.join("\n") };
}

// ---------------------------------------------------------------- launching

function parseArgs(argv) {
  const o = { runs: 10, warmup: 1, profile: "temp", updates: "off", trace: false, label: "run", exe: null, help: false };
  const need = (i) => { if (i + 1 >= argv.length) throw new Error(`Missing value for ${argv[i]}`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help": case "-h": o.help = true; break;
      case "--runs": o.runs = parseInt(need(i++), 10); break;
      case "--warmup": o.warmup = parseInt(need(i++), 10); break;
      case "--profile": o.profile = need(i++); break;
      case "--updates": o.updates = need(i++); break;
      case "--trace": o.trace = true; break;
      case "--label": o.label = need(i++); break;
      case "--exe": o.exe = need(i++); break;
      default: throw new Error(`Unknown option ${a}`);
    }
  }
  if (!Number.isInteger(o.runs) || o.runs < 1) throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(o.warmup) || o.warmup < 0) throw new Error("--warmup must be a non-negative integer");
  if (!["temp", "real"].includes(o.profile)) throw new Error("--profile must be temp or real");
  if (!["on", "off"].includes(o.updates)) throw new Error("--updates must be on or off");
  return o;
}

function checkBundle() {
  const bundle = path.join(ROOT, "renderer/js/bundle.js");
  const fix = "Run: npm run sass:build && npm run build:renderer";
  if (!fs.existsSync(bundle)) throw new Error(`renderer/js/bundle.js is missing. ${fix}`);
  // Source maps are inlined at the very end of a dev bundle; only read the tail.
  const size = fs.statSync(bundle).size;
  const fd = fs.openSync(bundle, "r");
  const len = Math.min(size, 4096);
  const buf = Buffer.alloc(len);
  fs.readSync(fd, buf, 0, len, size - len);
  fs.closeSync(fd);
  if (buf.toString("utf8").includes("sourceMappingURL=data:")) {
    throw new Error(`renderer/js/bundle.js is a dev bundle (inline source map), which invalidates M9/M16. ${fix}`);
  }
}

function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

// Same seeding as tests/e2e/util/Electron.js (preferences.json), plus recentFiles.json
// ([{ path, time }], see main/handlers/recentFilesHandler.js) with 10 fixture entries.
function seedTempProfile(updatesOn) {
  const { buildTestPreferences } = require("../tests/e2e/util/Electron.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-perf-"));
  const prefs = buildTestPreferences();
  if (updatesOn) {
    prefs.general.checkForUpdates = [true];
    prefs.general.checkForSchemaUpdates = [true];
  }
  fs.writeFileSync(path.join(dir, "preferences.json"), JSON.stringify(prefs, null, 2));

  const fixtures = listFiles(path.join(ROOT, "tests/data/m22"))
    .sort((a, b) => (/career/i.test(b) ? 1 : 0) - (/career/i.test(a) ? 1 : 0) || a.localeCompare(b));
  const now = Date.now();
  const recent = [];
  for (let i = 0; i < 10 && fixtures.length; i++) {
    recent.push({ path: fixtures[i % fixtures.length], time: now - i * 60000 });
  }
  fs.writeFileSync(path.join(dir, "recentFiles.json"), JSON.stringify(recent));
  return dir;
}

function killTree(child) {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch (e) { /* already gone */ }
}

function launchOnce(opts, outDir, runIndex, trace) {
  return new Promise((resolve) => {
    const profileDir = opts.profile === "temp" ? seedTempProfile(opts.updates === "on") : null;
    const spawnT = Date.now();
    const env = {
      ...process.env,
      NODE_ENV: "production",
      MFE_PERF: "1",
      MFE_PERF_AUTOQUIT: "1",
      MFE_PERF_OUT: outDir,
      MFE_PERF_RUN: String(runIndex),
      MFE_PERF_SPAWN_T: String(spawnT)
    };
    if (trace) env.MFE_PERF_TRACE = "1";
    delete env.ELECTRON_RUN_AS_NODE;
    const extra = profileDir ? [`--user-data-dir=${profileDir}`] : [];
    const cmd = opts.exe ? path.resolve(opts.exe) : require("electron");
    const args = opts.exe ? extra : [path.join(ROOT, "main.js"), ...extra];
    const child = spawn(cmd, args, { env, stdio: "ignore", windowsHide: false });
    let hardKilled = false;
    let done = false;
    const finish = (info) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (profileDir) { try { fs.rmSync(profileDir, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* best effort */ } }
      resolve({ spawnT, hardKilled, ...info });
    };
    const timer = setTimeout(() => { hardKilled = true; killTree(child); }, RUN_TIMEOUT_MS);
    child.on("error", (err) => finish({ error: err.message }));
    child.on("exit", (code) => finish({ code }));
  });
}

function readRunJson(outDir, i) {
  try { return JSON.parse(fs.readFileSync(path.join(outDir, `run-${i}.json`), "utf8")); } catch (e) { return null; }
}

function gitSha() {
  try { return execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch (e) { return "nogit"; }
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }
  checkBundle();
  if (opts.profile === "real" && opts.updates === "on") console.warn("Note: --updates is ignored with --profile real (your own preferences apply).");

  const safeLabel = opts.label.replace(/[^\w.-]+/g, "_");
  const outDir = path.join(ROOT, "test", "perf-results", `${stamp()}-${opts.trace ? safeLabel + "-trace" : safeLabel}-${gitSha()}`);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Output: ${outDir}`);

  if (opts.trace) {
    const res = await launchOnce(opts, outDir, 0, true);
    const run = readRunJson(outDir, 0);
    console.log(run ? `Traced run done${res.hardKilled ? " (hard-killed)" : ""}. tracePath: ${run.tracePath || "n/a"}` : "Traced run wrote no JSON.");
    console.log("Open the trace at https://ui.perfetto.dev");
    return;
  }

  const total = opts.warmup + opts.runs;
  const results = [];
  for (let i = 0; i < total; i++) {
    const warm = i < opts.warmup;
    process.stdout.write(`${warm ? "warmup" : "run"} ${i + 1}/${total} ... `);
    const res = await launchOnce(opts, outDir, i, false);
    const json = readRunJson(outDir, i);
    console.log(res.error ? `error: ${res.error}` : `${res.hardKilled ? "HARD-KILLED, " : ""}${json ? (json.timedOut ? "timedOut" : "ok") : "no JSON"}`);
    results.push({ i, warm, spawnT: res.spawnT, json });
  }

  const measured = results.filter((r) => !r.warm);
  const { summary, markdown } = summarize(measured.map((r) => r.json), {
    label: opts.label, sizes: bundleSizes(), spawnTs: measured.map((r) => r.spawnT)
  });
  summary.options = opts;
  summary.warmupRuns = results.filter((r) => r.warm).map((r) => r.i);
  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, "summary.md"), markdown);
  console.log(`\nWrote summary.json and summary.md to ${outDir}`);
  if (summary.hiddenCount) {
    console.warn(`WARNING: ${summary.hiddenCount} run(s) had a hidden main window and were excluded. Keep the screen on and unobstructed.`);
  }
}

module.exports = { summarize, computeRunMetrics, stats, percentile, parseArgs, MANDATORY_MARKS };

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
