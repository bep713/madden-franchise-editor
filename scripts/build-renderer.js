const browserify = require("browserify");
const watchify = require("watchify");
const fs = require("fs");
const path = require("path");

const isWatchMode = process.argv.includes("--watch");
const READY_FILE = path.join(__dirname, ".watcher-ready");

// Track all watchify bundlers so they can be closed on shutdown
const bundlers = [];

// Clean up stale ready file from a previous crashed run
if (isWatchMode) {
  try {
    fs.unlinkSync(READY_FILE);
  } catch {
    // File doesn't exist, ignore
  }
}

const bundles = [
  {
    entry: "../renderer/js/index.js",
    output: "../renderer/js/bundle.js",
    label: "Main renderer",
  },
  {
    entry: "../renderer/js/schemaManager.js",
    output: "../renderer/js/schemaManager.bundle.js",
    label: "Schema manager",
  },
  {
    entry: "../renderer/js/settingsManager.js",
    output: "../renderer/js/settingsManager.bundle.js",
    label: "Settings manager",
  },
  {
    entry: "../renderer/js/worker.js",
    output: "../renderer/js/worker.bundle.js",
    label: "Worker",
  },
];

function createBundler(entry, label) {
  const opts = {
    basedir: __dirname,
    debug: true,
  };

  let b;
  if (isWatchMode) {
    // Use watchify for incremental rebuilds
    b = browserify(entry, opts);
    b.plugin(watchify);
    bundlers.push(b);
    console.log(`⏳ ${label} watching for changes...`);
  } else {
    b = browserify(entry, opts);
  }

  // Shim electron module for renderer (contextIsolation: true)
  b.require("../renderer/js/electron-shim.js", { expose: "electron" });
  // Ignore madden-franchise since it runs in main process
  b.ignore("madden-franchise");
  // Ignore lz4-napi (native module, runs in main process)
  b.ignore("lz4-napi");
  // Stub fs/promises for schemaSearchService (runs in main process)
  b.exclude("fs/promises");
  // Exclude Node builtins that can't be polyfilled for browser
  b.exclude("worker_threads");
  b.exclude("inspector");

  return b;
}

function writeBundle(b, output, label) {
  return new Promise((resolve, reject) => {
    b.bundle((err, buf) => {
      if (err) {
        console.error(`✗ Error bundling ${label}:`, err.message);
        if (!isWatchMode) reject(err);
        return;
      }

      fs.writeFileSync(path.join(__dirname, output), buf);
      const timestamp = new Date().toLocaleTimeString();
      console.log(`✓ [${timestamp}] ${label} → ${output}`);
      resolve();
    });
  });
}

async function bundle(entry, output, label) {
  console.log(`Bundling ${label}...`);
  const b = createBundler(entry, label);

  if (isWatchMode) {
    // Initial build activates watchify's file watchers
    await writeBundle(b, output, label);

    // Rebuild on changes
    b.on("update", async () => {
      console.log(`\n↻ ${label} changed, rebuilding...`);
      await writeBundle(b, output, label);
    });

    b.on("log", (msg) => {
      // Watchify logs bundle size and time
      console.log(`  ${msg}`);
    });

    // Watchers are now active and will keep the process alive
  } else {
    await writeBundle(b, output, label);
  }
}

// Cleanup on graceful shutdown — registered early so it's always active
function cleanup() {
  try {
    fs.unlinkSync(READY_FILE);
  } catch {
    // ignore
  }
  // Close all watchify instances to release file watchers
  for (const b of bundlers) {
    try {
      b.close();
    } catch {
      // ignore errors during shutdown
    }
  }
}

if (isWatchMode) {
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", cleanup);
  process.on("exit", cleanup);
}

async function buildAll() {
  if (isWatchMode) {
    // In watch mode, start all bundles watching in parallel
    console.log(
      "\n🔍 Watch mode enabled. Bundles will rebuild on file changes.\n",
    );
    await Promise.all(
      bundles.map(({ entry, output, label }) => bundle(entry, output, label)),
    );

    // Signal that all initial builds are complete
    fs.writeFileSync(READY_FILE, Date.now().toString());
    console.log("\n✅ All bundles built and watching for changes.\n");
  } else {
    // Sequential build for one-off builds
    for (const { entry, output, label } of bundles) {
      try {
        await bundle(entry, output, label);
      } catch (err) {
        console.error(`Failed to bundle ${label}`);
        process.exit(1);
      }
    }
    console.log("\nAll bundles built successfully!");
  }
}

buildAll();
