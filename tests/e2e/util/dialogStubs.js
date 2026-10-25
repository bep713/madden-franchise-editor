// Replaces Electron's native dialogs in the main process, so tests can pick
// files without a TestUtility hook in the renderer. main.js looks up
// dialog.showOpenDialog / showSaveDialog at call time, so the stub applies to
// every later dialog in this app instance.

async function stubOpenDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, p) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] });
  }, filePath);
}

async function stubSaveDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, filePath);
}

module.exports = { stubOpenDialog, stubSaveDialog };
