#!/usr/bin/env node
// File-open performance harness. Launches the app with MFE_PERF=1 + MFE_PERF_OPEN=<copy of a franchise file>,
// collects the run JSON written by main/services/startupProfiler.js and summarizes it.
// Format and metric definitions: .claude/plans/file-open/file-open-baseline-contract.md
// Usage: node scripts/perf-file-open.js --help
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFileSync } = require("child_process");
const { stats } = require("./perf-startup.js");

const ROOT = path.join(__dirname, "..");
const RUN_TIMEOUT_MS = 90000;

const FILES = {
  m22: { label: "Madden 22", pristine: "tests/data/m22/career/CAREER-M22TEST", type: "madden" },
  c27: { label: "CFB 27", pristine: "tests/data/c27/dynasty/DYNASTY-DYNASTY", type: "cfb" },
};
const EDITORS = ["open-home", "open-table-editor", "open-schedule", "open-schema-viewer"];
const COMMON_MARKS = [
  "open:requested", "open:loader-shown", "open:meta-prepass-start", "open:meta-prepass-end",
  "open:parse-start", "open:parse-ready", "open:metadata-built", "open:openfile-ipc-start",
  "open:openfile-ipc-end", "open:tabs-generated", "open:file-loaded-recv", "open:editor-start",
  "open:loader-hidden", "open:interactive",
];
const EDITOR_MARKS = {
  "open-home": [],
  "open-table-editor": ["open:editor-visible", "open:te-start", "open:te-metadata", "open:te-tablelist", "open:te-selectr", "open:te-ready"],
  "open-schedule": ["open:editor-visible", "open:schedule-start", "open:schedule-end"],
  "open-schema-viewer": ["open:editor-visible", "open:schema-viewer-start", "open:schema-viewer-end"],
};

const HELP = `Usage: node scripts/perf-file-open.js [options]

  --file m22|c27|both        (default both)
  --editor <value>|all       one of ${EDITORS.join(", ")} (default all)
  --runs N                   measured runs per cell (default 10)
  --warmup N                 discarded warmup runs per cell (default 1)
  --warm                     also open the same file a second time in the session (warm open)
  --autosave on|off          preference general.autoSave (default off)
  --label <name>             label for the output directory (default "open")

Does not build anything. Run first: npm run sass:build && npm run build:renderer
Keep the screen on and the window visible (hidden runs are dropped).
Output: test/perf-results/<YYYYMMDD-HHmm>-<label>-<sha>/ (run-*.json, summary.json, summary.md)
`;

// ---------------------------------------------------------------- run JSON helpers

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const diff = (a, b) => (isNum(a) && isNum(b) ? a - b : null);
const fmt = (v) => (isNum(v) ? v.toFixed(1) : "n/a");

// Splits a run's marks into one list per open, at each open:requested.
function segments(run) {
  const marks = (run.marks || []).filter((m) => m && m.name && isNum(m.t)).sort((a, b) => a.t - b.t);
  const starts = marks.filter((m) => m.name === "open:requested").map((m) => m.t);
  return starts.map((s, i) => marks.filter((m) => m.t >= s && (i + 1 >= starts.length || m.t < starts[i + 1])));
}

const first = (seg, name) => { const m = seg.find((x) => x.name === name); return m ? m.t : null; };
const last = (seg, name) => { const l = seg.filter((x) => x.name === name); return l.length ? l[l.length - 1].t : null; };

function missing(seg, editor) {
  return [...COMMON_MARKS, ...(EDITOR_MARKS[editor] || [])].filter((n) => first(seg, n) === null);
}

// All values in ms unless noted.
function segmentMetrics(seg, run, userWaitMs = 0) {
  const total = diff(first(seg, "open:interactive"), first(seg, "open:requested"));
  const lib = diff(first(seg, "open:parse-ready"), first(seg, "open:parse-start"));
  const builds = seg.filter((m) => m.name === "open:metadata-built");
  const t0 = first(seg, "open:requested");
  const t1 = first(seg, "open:interactive");
  const longtasks = ((run.renderer && run.renderer.main && run.renderer.main.openLongtasks) || [])
    .filter((l) => isNum(t0) && isNum(t1) && l.t >= t0 && l.t <= t1);
  return {
    total,
    prePass: diff(first(seg, "open:meta-prepass-end"), first(seg, "open:meta-prepass-start")),
    libParse: lib,
    appOverhead: isNum(total) && isNum(lib) ? total - lib - userWaitMs : null,
    editorReady: diff(first(seg, "open:interactive"), first(seg, "open:editor-start")),
    tabsToInteractive: diff(first(seg, "open:interactive"), first(seg, "open:tabs-generated")),
    backup: diff(last(seg, "open:backup-end"), first(seg, "open:backup-start")),
    metadataBuilds: builds.length,
    metadataBytes: builds.reduce((a, m) => a + ((m.detail && m.detail.bytes) || 0), 0),
    longtasks: longtasks.length,
    longtaskMs: longtasks.reduce((a, l) => a + l.duration, 0),
  };
}

const METRICS = [
  ["total", "M-open-total"], ["prePass", "M-pre-pass"], ["libParse", "M-lib-parse"],
  ["appOverhead", "M-app-overhead"], ["editorReady", "M-editor-ready"], ["tabsToInteractive", "tabs -> interactive"],
  ["backup", "backup write"], ["metadataBuilds", "metadata builds (count)"], ["metadataBytes", "metadata IPC bytes"],
  ["longtasks", "longtasks (count)"], ["longtaskMs", "longtasks (ms)"],
];

function summarizeCell(runs, editor, which) {
  const per = [];
  let bad = 0;
  for (const run of runs) {
    if (!run || run.timedOut) { bad++; continue; }
    if ((run.marks || []).some((m) => m.name === "renderer:page-hidden")) { bad++; continue; }
    const seg = segments(run)[which];
    if (!seg || missing(seg, editor).length) { bad++; continue; }
    per.push(segmentMetrics(seg, run));
  }
  const out = { runs: per.length, dropped: bad, metrics: {} };
  for (const [k] of METRICS) out.metrics[k] = stats(per.map((p) => p[k]));
  return out;
}

// ---------------------------------------------------------------- summary

function buildMarkdown(cells, opts) {
  const lines = [`# File-open baseline: ${opts.label}`, "", `Options: ${JSON.stringify(opts)}`, ""];
  lines.push("Median ms (p90 / min). `n` = valid runs, `drop` = runs dropped (timeout, hidden, missing marks).", "");
  lines.push("| file | editor | open | n | drop | " + METRICS.slice(0, 5).map((m) => m[1]).join(" | ") + " |");
  lines.push("|---|---|---|---|---|" + METRICS.slice(0, 5).map(() => "---").join("|") + "|");
  for (const c of cells) {
    if (c.notApplicable) { lines.push(`| ${c.file} | ${c.editor} | - | - | - | n/a (editor not available for this game) |`); continue; }
    for (const which of ["cold", "warm"]) {
      const s = c[which];
      if (!s) continue;
      const cols = METRICS.slice(0, 5).map(([k]) => {
        const st = s.metrics[k];
        return `${fmt(st.median)} (${fmt(st.p90)} / ${fmt(st.min)})`;
      });
      lines.push(`| ${c.file} | ${c.editor} | ${which} | ${s.runs} | ${s.dropped} | ${cols.join(" | ")} |`);
    }
  }
  lines.push("", "## Other metrics (median)", "");
  lines.push("| file | editor | open | " + METRICS.slice(5).map((m) => m[1]).join(" | ") + " |");
  lines.push("|---|---|---|" + METRICS.slice(5).map(() => "---").join("|") + "|");
  for (const c of cells) {
    if (c.notApplicable) continue;
    for (const which of ["cold", "warm"]) {
      const s = c[which];
      if (!s) continue;
      lines.push(`| ${c.file} | ${c.editor} | ${which} | ` + METRICS.slice(5).map(([k]) => fmt(s.metrics[k].median)).join(" | ") + " |");
    }
  }
  lines.push("", "Gap check: M-app-overhead + M-lib-parse should equal M-open-total (no user waits in these files).", "");
  return lines.join("\n");
}

// ---------------------------------------------------------------- launching

function parseArgs(argv) {
  const o = { file: "both", editor: "all", runs: 10, warmup: 1, warm: false, autosave: "off", label: "open", help: false };
  const need = (i) => { if (i + 1 >= argv.length) throw new Error(`Missing value for ${argv[i]}`); return argv[i + 1]; };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--help": case "-h": o.help = true; break;
      case "--file": o.file = need(i++); break;
      case "--editor": o.editor = need(i++); break;
      case "--runs": o.runs = parseInt(need(i++), 10); break;
      case "--warmup": o.warmup = parseInt(need(i++), 10); break;
      case "--warm": o.warm = true; break;
      case "--autosave": o.autosave = need(i++); break;
      case "--label": o.label = need(i++); break;
      default: throw new Error(`Unknown option ${a}`);
    }
  }
  if (!["m22", "c27", "both"].includes(o.file)) throw new Error("--file must be m22, c27 or both");
  if (o.editor !== "all" && !EDITORS.includes(o.editor)) throw new Error(`--editor must be all or one of ${EDITORS.join(", ")}`);
  if (!Number.isInteger(o.runs) || o.runs < 1) throw new Error("--runs must be a positive integer");
  if (!Number.isInteger(o.warmup) || o.warmup < 0) throw new Error("--warmup must be a non-negative integer");
  if (!["on", "off"].includes(o.autosave)) throw new Error("--autosave must be on or off");
  return o;
}

function checkBundle() {
  if (!fs.existsSync(path.join(ROOT, "renderer/js/bundle.js"))) {
    throw new Error("renderer/js/bundle.js is missing. Run: npm run sass:build && npm run build:renderer");
  }
}

function seedProfile(editor, autosave) {
  const { buildTestPreferences } = require("../tests/e2e/util/Electron.js");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-perf-open-"));
  const prefs = buildTestPreferences();
  prefs.general.defaultEditor = editor;
  prefs.general.autoSave = autosave === "on" ? [true] : [];
  fs.writeFileSync(path.join(dir, "preferences.json"), JSON.stringify(prefs, null, 2));
  return dir;
}

function killTree(child) {
  try {
    if (process.platform === "win32") execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch (e) { /* already gone */ }
}

function launchOnce(opts, fileKey, editor, outDir, runIndex) {
  return new Promise((resolve) => {
    const profileDir = seedProfile(editor, opts.autosave);
    // Never open the pristine fixture: auto-save, backup and the watcher can touch the file.
    const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mfe-perf-file-"));
    const copyPath = path.join(copyDir, path.basename(FILES[fileKey].pristine));
    fs.copyFileSync(path.join(ROOT, FILES[fileKey].pristine), copyPath);

    const env = {
      ...process.env,
      NODE_ENV: "production",
      MFE_PERF: "1",
      MFE_PERF_AUTOQUIT: "1",
      MFE_PERF_OUT: outDir,
      MFE_PERF_RUN: String(runIndex),
      MFE_PERF_SPAWN_T: String(Date.now()),
      MFE_PERF_OPEN: copyPath,
    };
    if (opts.warm) env.MFE_PERF_OPEN_WARM = "1";
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(require("electron"), [path.join(ROOT, "main.js"), `--user-data-dir=${profileDir}`], { env, stdio: "ignore", windowsHide: false });
    let done = false;
    let hardKilled = false;
    const finish = (info) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const d of [profileDir, copyDir]) { try { fs.rmSync(d, { recursive: true, force: true, maxRetries: 3 }); } catch (e) { /* best effort */ } }
      resolve({ hardKilled, ...info });
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

function editorAvailable(fileKey, editor) {
  return !(editor === "open-schedule" && FILES[fileKey].type !== "madden");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { console.log(HELP); return; }
  checkBundle();

  const outDir = path.join(ROOT, "test", "perf-results", `${stamp()}-${opts.label.replace(/[^\w.-]+/g, "_")}-${gitSha()}`);
  fs.mkdirSync(outDir, { recursive: true });
  console.log(`Output: ${outDir}`);

  const fileKeys = opts.file === "both" ? Object.keys(FILES) : [opts.file];
  const editors = opts.editor === "all" ? EDITORS : [opts.editor];
  const cells = [];
  let runIndex = 0;
  for (const fileKey of fileKeys) {
    for (const editor of editors) {
      const cell = { file: fileKey, editor };
      cells.push(cell);
      if (!editorAvailable(fileKey, editor)) { cell.notApplicable = true; continue; }
      const jsons = [];
      for (let i = 0; i < opts.warmup + opts.runs; i++) {
        const warmup = i < opts.warmup;
        process.stdout.write(`${fileKey} ${editor} ${warmup ? "warmup" : "run"} ${i + 1}/${opts.warmup + opts.runs} ... `);
        const idx = runIndex++;
        const res = await launchOnce(opts, fileKey, editor, outDir, idx);
        const json = readRunJson(outDir, idx);
        console.log(res.error ? `error: ${res.error}` : `${res.hardKilled ? "HARD-KILLED, " : ""}${json ? (json.timedOut ? "timedOut" : "ok") : "no JSON"}`);
        if (!warmup) jsons.push(json);
      }
      cell.cold = summarizeCell(jsons, editor, 0);
      if (opts.warm) cell.warm = summarizeCell(jsons, editor, 1);
    }
  }

  fs.writeFileSync(path.join(outDir, "summary.json"), JSON.stringify({ options: opts, cells }, null, 2));
  fs.writeFileSync(path.join(outDir, "summary.md"), buildMarkdown(cells, opts));
  console.log(`\nWrote summary.json and summary.md to ${outDir}`);
  const dropped = cells.reduce((a, c) => a + ((c.cold && c.cold.dropped) || 0), 0);
  if (dropped) console.warn(`WARNING: ${dropped} run(s) were dropped (timeout, hidden window or missing marks). Keep the screen on and unobstructed.`);
}

module.exports = { segments, segmentMetrics, summarizeCell, parseArgs };

if (require.main === module) {
  main().catch((e) => { console.error(e.message || e); process.exit(1); });
}
