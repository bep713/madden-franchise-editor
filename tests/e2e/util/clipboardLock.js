const fs = require("fs");
const os = require("os");
const path = require("path");

// The OS clipboard is shared by every worker, so a copy + Ctrl+V must not
// overlap with another worker's. mkdir is atomic, so the folder is the lock.
const LOCK_DIR = path.join(os.tmpdir(), "mfe-e2e-clipboard.lock");
const RETRY_MS = 50;
// A lock this old was left by a crashed worker
const STALE_MS = 60 * 1000;

function tryAcquire() {
  try {
    fs.mkdirSync(LOCK_DIR);
    return true;
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw e;
    }
  }

  try {
    if (Date.now() - fs.statSync(LOCK_DIR).mtimeMs > STALE_MS) {
      fs.rmSync(LOCK_DIR, { recursive: true, force: true });
    }
  } catch (e) {
    /* released or taken over meanwhile */
  }
  return false;
}

async function withClipboardLock(fn) {
  while (!tryAcquire()) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
  }

  try {
    return await fn();
  } finally {
    fs.rmSync(LOCK_DIR, { recursive: true, force: true });
  }
}

module.exports = { withClipboardLock };
