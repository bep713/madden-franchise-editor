// Renderer side of the startup profiler (see main/services/startupProfiler.js).
// Everything is a no-op unless the app was launched with MFE_PERF=1.
const enabled = !!(
  window.electronAPI &&
  window.electronAPI.perf &&
  window.electronAPI.perf.enabled
);

const marks = [];
const paint = [];
const longtasks = [];
const observers = [];
let reported = false;
let onPaint = null;

function epoch(startTime) {
  return performance.timeOrigin + startTime;
}

function mark(name, detail) {
  if (!enabled || reported) return;
  marks.push({
    name,
    t: epoch(performance.now()),
    detail: detail === undefined ? null : detail,
  });
}

function observe(type, onEntry) {
  try {
    const po = new PerformanceObserver((list) => {
      list.getEntries().forEach(onEntry);
    });
    po.observe({ type, buffered: true });
    observers.push(po);
  } catch (e) {
    // entry type unsupported
  }
}

if (enabled) {
  const tag = performance.getEntriesByName("renderer:bundle-tag")[0];
  if (tag) {
    marks.push({
      name: "renderer:bundle-tag",
      t: epoch(tag.startTime),
      detail: null,
    });
  }
  // A hidden or occluded window throttles timers and skips paints, which
  // skews every renderer metric. Flag it so the harness can drop the run.
  const markHidden = () => {
    if (document.visibilityState === "hidden") mark("renderer:page-hidden");
  };
  markHidden();
  document.addEventListener("visibilitychange", markHidden);
  observe("paint", (e) => {
    paint.push({ name: e.name, t: epoch(e.startTime) });
    if (onPaint) onPaint();
  });
  observe("longtask", (e) =>
    longtasks.push({ t: epoch(e.startTime), duration: e.duration }),
  );
}

function lastMark(name) {
  for (let i = marks.length - 1; i >= 0; i--) {
    if (marks[i].name === name) return marks[i];
  }
  return null;
}

const FCP_WAIT_MS = 3000;

function hasFcp() {
  return paint.some((p) => p.name === "first-contentful-paint");
}

// FCP can land after recent-files-rendered; wait (bounded) so M8 is captured.
function waitForFcp() {
  if (hasFcp()) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, FCP_WAIT_MS);
    onPaint = () => {
      if (hasFcp()) {
        clearTimeout(timer);
        resolve();
      }
    };
  });
}

async function report() {
  if (!enabled || reported) return;
  reported = true;
  await waitForFcp();
  onPaint = null;

  observers.forEach((po) => {
    try {
      po.takeRecords().forEach((e) => {
        if (e.entryType === "paint") {
          paint.push({ name: e.name, t: epoch(e.startTime) });
        } else if (e.entryType === "longtask") {
          longtasks.push({ t: epoch(e.startTime), duration: e.duration });
        }
      });
    } catch (err) {
      // ignore
    }
  });

  const loaded = lastMark("renderer:prefs-loaded");
  const check = lastMark("renderer:update-prompt-check");
  const nav = performance.getEntriesByType("navigation")[0];

  const payload = {
    timeOrigin: performance.timeOrigin,
    marks,
    paint,
    longtasks,
    resources: performance.getEntriesByType("resource").map((r) => ({
      name: r.name,
      t: epoch(r.startTime),
      duration: r.duration,
      transferSize: r.transferSize,
    })),
    navigation: nav ? nav.toJSON() : null,
    prefsRace: {
      prefsLoadedT: loaded ? loaded.t : null,
      checkT: check ? check.t : null,
      prefsLoadedAtCheck:
        check && check.detail ? !!check.detail.prefsLoaded : null,
    },
  };

  try {
    await window.electronAPI.perf.report(payload);
  } catch (err) {
    console.warn("perf report failed", err);
  }
}

module.exports = { enabled, mark, report };
