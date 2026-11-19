#!/usr/bin/env node
// Launches one isolated Madden Franchise Editor instance (own userData, own
// copy of the M22 career fixture), runs a scenario file against it through
// the repo's Playwright e2e harness, and writes evidence to
// test/verify-evidence/<runId>/. Always closes the app it started.
//
// Usage:
//   node .claude/skills/verify-mfe/scripts/drive.js <scenario.js> [options]
//
// Options:
//   --ui react|v4        UI to load (default react; react needs npm run build:react)
//   --run-id <id>        evidence folder name (default <timestamp>-<scenario>)
//   --out <dir>          evidence root (default test/verify-evidence)
//   --prefs '<json>'     preferences merged over the test defaults,
//                        e.g. '{"general":{"autoSave":[true]}}'
//   --env '<json>'       extra env vars for the app, e.g. '{"MFE_UPDATE_CHECK_DELAY_MS":"0"}'
//   --keep-sandbox       leave the sandbox copy in the temp folder after the run
//   --no-trace           skip the Playwright trace (saves ~20% time)
//
// A scenario is a CommonJS module:
//   module.exports = async (ctx) => { ... }
// ctx = { electronApp, app, window, ui, sandbox, models, e2e, stubs, poll,
//         readSavedTable, shot, log, keep, evidenceDir }
// See SKILL.md for what each one is.

const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO = path.resolve(__dirname, "../../../..");
const E2E = path.join(REPO, "tests/e2e");
const e2e = (rel) => require(path.join(E2E, rel));

function parseArgs(argv) {
  const args = { ui: "react", trace: true, keepSandbox: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--ui") args.ui = argv[++i];
    else if (a === "--run-id") args.runId = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--prefs") args.prefs = JSON.parse(argv[++i]);
    else if (a === "--env") args.env = JSON.parse(argv[++i]);
    else if (a === "--keep-sandbox") args.keepSandbox = true;
    else if (a === "--no-trace") args.trace = false;
    else if (a === "-h" || a === "--help") args.help = true;
    else rest.push(a);
  }
  args.scenario = rest[0];
  return args;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.scenario) {
    console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(1, 30).join("\n"));
    process.exit(args.help ? 0 : 2);
  }
  if (!["react", "v4"].includes(args.ui)) throw new Error(`--ui must be react or v4`);

  const scenarioPath = path.resolve(args.scenario);
  const scenario = require(scenarioPath);
  const scenarioName = path.basename(scenarioPath).replace(/\.js$/, "");
  const runId = args.runId || `${stamp()}-${scenarioName}`;
  const evidenceDir = path.resolve(args.out || path.join(REPO, "test/verify-evidence"), runId);
  fs.mkdirSync(evidenceDir, { recursive: true });

  const logPath = path.join(evidenceDir, "log.txt");
  const log = (...parts) => {
    const line = `[${new Date().toISOString()}] ${parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")}`;
    fs.appendFileSync(logPath, line + "\n");
    console.log(line);
  };

  const runJsonPath = path.join(evidenceDir, "run.json");
  const run = {
    runId,
    scenario: scenarioPath,
    ui: args.ui,
    evidenceDir,
    startedAt: new Date().toISOString(),
    status: "starting",
  };
  const writeRun = () => fs.writeFileSync(runJsonPath, JSON.stringify(run, null, 2));
  writeRun();

  // Electron.js / sandbox.js are the same helpers the e2e specs use: each
  // launch gets a fresh userData dir (deleted on close) with first-run pages,
  // update checks and auto-save turned off.
  const electron = e2e("util/Electron.js");
  const { makeSandbox, removeSandbox } = e2e("util/sandbox.js");
  const App = e2e("models/App.js");
  const stubs = e2e("util/dialogStubs.js");
  const { poll } = e2e("util/poll.js");
  const { readSavedTable } = e2e("util/diskReader.js");

  const sandbox = makeSandbox();
  run.sandboxDir = sandbox.dir;
  writeRun();
  log(`run ${runId}: ui=${args.ui} sandbox=${sandbox.careerPath}`);

  let electronApp;
  let window;
  let shotIndex = 0;
  const shot = async (name) => {
    if (!window) throw new Error("no window yet");
    const base = path.join(evidenceDir, `${String(++shotIndex).padStart(2, "0")}-${name}`);
    await window.screenshot({ path: `${base}.png` });
    try {
      fs.writeFileSync(`${base}.aria.txt`, await window.locator("body").ariaSnapshot());
    } catch (e) {
      log(`aria snapshot failed for ${name}: ${e.message}`);
    }
    log(`shot ${path.basename(base)}.png`);
    return `${base}.png`;
  };
  const keep = (filePath, name) => {
    const dest = path.join(evidenceDir, name || path.basename(filePath));
    fs.copyFileSync(filePath, dest);
    log(`kept ${filePath} -> ${path.basename(dest)}`);
    return dest;
  };

  let exitCode = 0;
  try {
    electronApp = await electron.launchWithDefaultOptions({
      ui: args.ui,
      preferences: args.prefs,
      env: args.env,
      trace: args.trace,
    });
    run.pid = electronApp.process().pid;
    run.userDataDir = electron.userDataDir;
    run.status = "running";
    writeRun();
    log(`launched pid=${run.pid} userData=${run.userDataDir}`);

    const app = new App(electronApp);
    window = await app.getMainWindow();

    const models = {};
    if (args.ui === "react") {
      const r = (n) => e2e(`models/react/${n}.js`);
      models.welcome = new (r("WelcomePage"))(window);
      models.nav = new (r("NavigationBar"))(window);
      models.tableEditor = new (r("TableEditorPage"))(window);
      models.schedule = new (r("ScheduleEditorPage"))(window);
      models.schemas = new (r("SchemaManagementPage"))(window);
      models.schemaViewer = new (r("SchemaViewer"))(window);
      await models.welcome.waitForPageLoad();
    } else {
      models.welcome = new (e2e("models/WelcomePage.js"))(window);
      models.tableEditor = new (e2e("models/TableEditorPage.js"))(window);
    }
    log("main window ready");

    await scenario({
      electronApp, app, window, ui: args.ui, sandbox, models, e2e, stubs, poll,
      readSavedTable, shot, log, keep, evidenceDir,
    });
    run.status = "passed";
    log("scenario PASSED");
  } catch (err) {
    exitCode = 1;
    run.status = "failed";
    run.error = String(err && err.stack ? err.stack : err);
    log(`scenario FAILED: ${run.error}`);
    if (window) {
      try {
        await window.screenshot({ path: path.join(evidenceDir, "failure.png") });
        fs.writeFileSync(path.join(evidenceDir, "failure.aria.txt"), await window.locator("body").ariaSnapshot());
      } catch (e) { /* app may be gone */ }
    }
  } finally {
    if (electronApp) {
      if (electron.tracing) {
        try {
          await electronApp.context().tracing.stop({ path: path.join(evidenceDir, "trace.zip") });
          log("trace.zip saved");
        } catch (e) { log(`trace not saved: ${e.message}`); }
      }
      try {
        await electronApp.close();
        log("app closed");
      } catch (e) {
        log(`close failed (${e.message}); run cleanup.js --run ${runId}`);
      }
    }
    run.closed = true;
    if (args.keepSandbox) {
      log(`sandbox kept at ${sandbox.dir}`);
    } else {
      removeSandbox(sandbox);
      run.sandboxRemoved = !fs.existsSync(sandbox.dir);
    }
    run.finishedAt = new Date().toISOString();
    writeRun();
    console.log(`\nEvidence: ${evidenceDir}\nStatus: ${run.status}`);
    process.exit(exitCode);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
