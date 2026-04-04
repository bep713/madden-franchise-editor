const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const READY_FILE = path.join(__dirname, "..", ".watcher-ready");
const TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

// Clean up any stale ready file
try {
  fs.unlinkSync(READY_FILE);
} catch {
  // File doesn't exist, ignore
}

console.log("[DEV] Starting renderer watcher...");

// Start the watcher process
const watcher = spawn("npm", ["run", "watch:renderer"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NODE_ENV: "development" },
});

watcher.on("error", (err) => {
  console.error("[DEV] Failed to start watcher:", err.message);
  process.exit(1);
});

// Poll for the ready file
const startTime = Date.now();
const poll = setInterval(() => {
  if (fs.existsSync(READY_FILE)) {
    clearInterval(poll);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DEV] Bundles ready after ${elapsed}s. Starting Electron...`);

    // Start Electron alongside the still-running watcher
    const electron = spawn("npm", ["run", "dev:electron"], {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, NODE_ENV: "development" },
    });

    electron.on("error", (err) => {
      console.error("[DEV] Failed to start Electron:", err.message);
      process.exit(1);
    });

    // Forward signals to child processes
    const cleanup = (signal) => {
      electron.kill(signal);
      watcher.kill(signal);
    };
    process.on("SIGINT", () => cleanup("SIGINT"));
    process.on("SIGTERM", () => cleanup("SIGTERM"));

    // Exit when Electron exits
    electron.on("exit", (code) => {
      watcher.kill();
      process.exit(code);
    });

    return;
  }

  if (Date.now() - startTime > TIMEOUT_MS) {
    clearInterval(poll);
    console.error("[DEV] Timed out waiting for bundles to be ready.");
    watcher.kill();
    process.exit(1);
  }
}, POLL_INTERVAL_MS);

// If watcher exits before ready, we should exit too
watcher.on("exit", (code) => {
  if (!fs.existsSync(READY_FILE)) {
    console.error("[DEV] Watcher exited before bundles were ready.");
    process.exit(code);
  }
});
