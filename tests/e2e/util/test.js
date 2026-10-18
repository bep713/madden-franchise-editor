const base = require("@playwright/test");
const electron = require("./Electron");

// Playwright's `use.trace` only covers its own browser fixtures, not apps
// started with _electron.launch(). Electron.js starts tracing on launch; this
// saves the trace and a screenshot when a test fails, so CI failures can be
// opened in the trace viewer.
const test = base.test.extend({
  failureArtifacts: [
    async ({}, use, testInfo) => {
      await use();

      const app = electron.electron;
      if (!app || testInfo.status === testInfo.expectedStatus) {
        return;
      }

      try {
        const window = app.windows().find((w) => w.url().includes("index.html"));
        if (window) {
          await window.screenshot({ path: testInfo.outputPath("failure.png") });
        }
        await app
          .context()
          .tracing.stop({ path: testInfo.outputPath("trace.zip") });
      } catch (e) {
        // the app may already be closed
      }
    },
    { auto: true },
  ],
});

module.exports = { ...base, test };
