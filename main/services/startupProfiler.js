// Startup profiler. Active only when MFE_PERF=1; otherwise every export is a no-op.
// Output format: .claude/plans/startup-baseline-contract.md
// Keep requires here minimal: perf_hooks, fs, path, module (electron is required lazily).
const { performance, monitorEventLoopDelay } = require("perf_hooks");
const fs = require("fs");
const path = require("path");

const env = process.env;
const enabled = env.MFE_PERF === "1";
const flags = {
  nohook: env.MFE_PERF_NOHOOK === "1",
  trace: env.MFE_PERF_TRACE === "1",
  autoquit: env.MFE_PERF_AUTOQUIT === "1",
};
const SETTLE_MS = 3000;
const TIMEOUT_MS = 30000;
const TRACE_CATEGORIES = [
  "devtools.timeline",
  "v8",
  "v8.execute",
  "disabled-by-default-v8.cpu_profiler",
  "blink",
  "loading",
  "toplevel",
];

const marks = [];
const requireEntries = [];
let requireTotalMs = 0;
let hooked = false;
let loopHistogram = null;
const windows = {};
const trackedWindows = {}; // name -> BrowserWindow
const renderer = {};
const reportedWindows = new Set();
const ipc = {};
let rendererRecentFilesRendered = false;
let settleTimer = null;
let finished = false;
let tracingStarted = false;
let tracePath = null;

const repoRoot = path.resolve(__dirname, "..", "..");
const mainFile = path.join(repoRoot, "main.js");
const mainDir = path.join(repoRoot, "main") + path.sep;

function now() {
  return performance.timeOrigin + performance.now();
}

function mark(name, detail) {
  if (!enabled) return;
  marks.push({
    name,
    t: now(),
    process: "main",
    detail: detail === undefined ? null : detail,
  });
}

function packageName(request, builtins) {
  if (typeof request !== "string" || !request) return null;
  const c = request[0];
  if (c === "." || c === "/" || path.isAbsolute(request)) return null;
  if (request.startsWith("node:") || request === "electron") return null;
  const parts = request.split("/");
  const name = c === "@" ? parts.slice(0, 2).join("/") : parts[0];
  if (builtins.has(request) || builtins.has(name)) return null;
  return name;
}

function installRequireHook() {
  if (!enabled || hooked || flags.nohook) return;
  hooked = true;
  const Module = require("module");
  const builtins = new Set(Module.builtinModules);
  const seenPackages = new Set();
  const original = Module._load;

  Module._load = function (request, parent) {
    const parentFile = parent && parent.filename;
    const issuedByMain =
      !!parentFile &&
      (parentFile === mainFile ||
        (parentFile.startsWith(mainDir) &&
          !parentFile.includes("node_modules")));
    const pkg = packageName(request, builtins);
    const trackPackage = !!pkg && !seenPackages.has(pkg);
    if (!issuedByMain && !trackPackage) {
      return original.apply(this, arguments);
    }
    if (trackPackage) seenPackages.add(pkg);

    const t0 = performance.now();
    try {
      return original.apply(this, arguments);
    } finally {
      const ms = performance.now() - t0;
      const parentRel = parentFile
        ? path.relative(repoRoot, parentFile).replace(/\\/g, "/")
        : null;
      if (issuedByMain) {
        requireEntries.push({
          kind: "main",
          name: request,
          parent: parentRel,
          ms,
        });
        if (parentFile === mainFile) requireTotalMs += ms;
      }
      if (trackPackage) {
        requireEntries.push({
          kind: "package",
          name: pkg,
          parent: parentRel,
          ms,
        });
      }
    }
  };
}

function startEventLoopMonitor() {
  if (!enabled || loopHistogram) return;
  loopHistogram = monitorEventLoopDelay({ resolution: 10 });
  loopHistogram.enable();
}

function recordIpc(channel, ms) {
  if (!enabled) return;
  const e = ipc[channel] || (ipc[channel] = { count: 0, totalMs: 0, maxMs: 0 });
  e.count++;
  e.totalMs += ms;
  if (ms > e.maxMs) e.maxMs = ms;
}

function trackWindow(name, browserWindow) {
  if (!enabled || !browserWindow) return;
  trackedWindows[name] = browserWindow;
  const w = (windows[name] = {
    created: now(),
    domReady: null,
    didFinishLoad: null,
  });
  const wc = browserWindow.webContents;
  wc.once("dom-ready", () => {
    w.domReady = now();
  });
  wc.once("did-finish-load", () => {
    w.didFinishLoad = now();
    maybeFinish();
  });
}

function windowNameFor(sender) {
  if (sender) {
    for (const name of Object.keys(trackedWindows)) {
      try {
        if (trackedWindows[name].webContents === sender) return name;
      } catch (e) {
        // window destroyed
      }
    }
    try {
      const pathname = new URL(sender.getURL()).pathname;
      return path.basename(pathname).replace(/\.[^.]*$/, "") || "unknown";
    } catch (e) {
      // fall through
    }
  }
  return "unknown";
}

function addRendererMarks(windowName, payload) {
  if (!enabled || !payload || reportedWindows.has(windowName)) return;
  reportedWindows.add(windowName);

  for (const m of payload.marks || []) {
    marks.push({
      name: m.name,
      t: m.t,
      process: `renderer:${windowName}`,
      detail: m.detail === undefined ? null : m.detail,
    });
    if (m.name === "renderer:recent-files-rendered") {
      rendererRecentFilesRendered = true;
    }
  }
  renderer[windowName] = {
    timeOrigin: payload.timeOrigin,
    paint: payload.paint || [],
    longtasks: payload.longtasks || [],
    resources: payload.resources || [],
    navigation: payload.navigation || null,
    prefsRace: payload.prefsRace || null,
  };
  maybeFinish();
}

function allWindowsLoaded() {
  const names = Object.keys(windows);
  return names.length > 0 && names.every((n) => windows[n].didFinishLoad);
}

function maybeFinish() {
  if (!enabled || finished || settleTimer) return;
  if (rendererRecentFilesRendered && allWindowsLoaded()) {
    settleTimer = setTimeout(() => finish(false), SETTLE_MS);
  }
}

function startTracing() {
  if (!enabled || !flags.trace || tracingStarted) return;
  tracingStarted = true;
  const { contentTracing } = require("electron");
  contentTracing
    .startRecording({ included_categories: TRACE_CATEGORIES })
    .catch((err) => console.error("[perf] failed to start tracing", err));
}

async function finish(timedOut) {
  if (!enabled || finished) return;
  finished = true;
  if (settleTimer) clearTimeout(settleTimer);

  const { app, contentTracing } = require("electron");
  const outDir =
    env.MFE_PERF_OUT || path.join(repoRoot, "test", "perf-results");
  const runId = env.MFE_PERF_RUN || String(Date.now());

  let eventLoop = null;
  if (loopHistogram) {
    loopHistogram.disable();
    eventLoop = {
      maxMs: loopHistogram.max / 1e6,
      p99Ms: loopHistogram.percentile(99) / 1e6,
      meanMs: loopHistogram.mean / 1e6,
    };
  }

  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (e) {
    console.error("[perf] could not create out dir", e);
  }

  if (tracingStarted) {
    try {
      tracePath = path.join(outDir, `trace-${runId}.json`);
      await contentTracing.stopRecording(tracePath);
    } catch (err) {
      console.error("[perf] failed to stop tracing", err);
      tracePath = null;
    }
  }

  const spawnT = env.MFE_PERF_SPAWN_T ? Number(env.MFE_PERF_SPAWN_T) : null;
  const result = {
    version: 1,
    timedOut: !!timedOut,
    spawnT,
    flags,
    env: {
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      platform: process.platform,
      packaged: app.isPackaged,
    },
    marks,
    requires: {
      totalMs: requireTotalMs,
      entries: requireEntries.slice().sort((a, b) => b.ms - a.ms),
    },
    eventLoop,
    windows,
    appMetrics: app.getAppMetrics(),
    renderer,
    ipc,
    tracePath,
  };

  try {
    fs.writeFileSync(
      path.join(outDir, `run-${runId}.json`),
      JSON.stringify(result, null, 2),
    );
  } catch (e) {
    console.error("[perf] could not write result", e);
  }

  if (flags.autoquit) app.quit();
}

if (enabled) {
  const timeout = setTimeout(() => finish(true), TIMEOUT_MS);
  timeout.unref();
}

module.exports = {
  enabled,
  flags,
  mark,
  installRequireHook,
  startEventLoopMonitor,
  recordIpc,
  addRendererMarks,
  trackWindow,
  windowNameFor,
  startTracing,
  maybeFinish,
  finish,
};
