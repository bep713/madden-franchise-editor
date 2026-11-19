#!/usr/bin/env node
// Tears down what verify runs left behind: for each run.json under the
// evidence root, kills that run's Electron PID (only if the process's command
// line still contains that run's userData dir), then removes its userData and
// sandbox temp folders. Evidence folders are never deleted.
//
// Usage:
//   node .claude/skills/verify-mfe/scripts/cleanup.js            # all runs
//   node .claude/skills/verify-mfe/scripts/cleanup.js --run <id> # one run
//   [--out <dir>] evidence root (default test/verify-evidence)

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.resolve(__dirname, "../../../..");
const argv = process.argv.slice(2);
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
const root = path.resolve(opt("--out") || path.join(REPO, "test/verify-evidence"));
const only = opt("--run");

function commandLine(pid) {
  try {
    if (process.platform === "win32") {
      return execSync(`powershell -NoProfile -Command "(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine"`, { encoding: "utf8" }).trim();
    }
    return execSync(`ps -o args= -p ${pid}`, { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function kill(pid) {
  if (process.platform === "win32") execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
  else process.kill(pid, "SIGKILL");
}

function rm(dir, label) {
  if (dir && fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    console.log(`  removed ${label} ${dir}`);
  }
}

if (!fs.existsSync(root)) {
  console.log(`No evidence root at ${root}; nothing to clean.`);
  process.exit(0);
}

const runs = fs.readdirSync(root).filter((d) => !only || d === only);
let touched = 0;
for (const id of runs) {
  const runJson = path.join(root, id, "run.json");
  if (!fs.existsSync(runJson)) continue;
  const run = JSON.parse(fs.readFileSync(runJson, "utf8"));
  const cmd = run.pid ? commandLine(run.pid) : "";
  const ours = run.userDataDir && cmd.includes(path.basename(run.userDataDir));
  const leftovers = ours || [run.userDataDir, run.sandboxDir].some((d) => d && fs.existsSync(d));
  if (!leftovers) continue;
  touched++;
  console.log(`run ${id} (${run.status})`);
  if (ours) {
    try { kill(run.pid); console.log(`  killed pid ${run.pid}`); }
    catch (e) { console.log(`  could not kill pid ${run.pid}: ${e.message}`); }
  }
  try { rm(run.userDataDir, "userData"); } catch (e) { console.log(`  userData busy: ${e.message}`); }
  try { rm(run.sandboxDir, "sandbox"); } catch (e) { console.log(`  sandbox busy: ${e.message}`); }
}
console.log(touched ? `Cleaned ${touched} run(s). Evidence kept in ${root}` : `Nothing to clean. Evidence kept in ${root}`);
