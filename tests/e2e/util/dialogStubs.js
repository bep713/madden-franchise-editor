// Replaces Electron's native dialogs in the main process, so tests can pick
// files without a TestUtility hook in the renderer. main.js looks up
// dialog.showOpenDialog / showSaveDialog at call time, so the stub applies to
// every later dialog in this app instance.

// Records each dialog's options for openDialogCalls
async function stubOpenDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, p) => {
    globalThis.__openDialogCalls = globalThis.__openDialogCalls || [];
    // Called as (options) or (parentWindow, options)
    dialog.showOpenDialog = async (...args) => {
      globalThis.__openDialogCalls.push(args[args.length - 1]);
      return { canceled: false, filePaths: [p] };
    };
  }, filePath);
}

async function openDialogCalls(electronApp) {
  return electronApp.evaluate(() => globalThis.__openDialogCalls || []);
}

async function stubSaveDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, filePath);
}

// Answers every later message box with button `response`, and records each
// box's options for messageBoxCalls
async function stubMessageBox(electronApp, response) {
  await electronApp.evaluate(({ dialog }, r) => {
    globalThis.__messageBoxCalls = globalThis.__messageBoxCalls || [];
    // Called as (options) or (parentWindow, options)
    dialog.showMessageBox = async (...args) => {
      globalThis.__messageBoxCalls.push(args[args.length - 1]);
      return { response: r, checkboxChecked: false };
    };
  }, response);
}

async function messageBoxCalls(electronApp) {
  return electronApp.evaluate(() => globalThis.__messageBoxCalls || []);
}

module.exports = {
  stubOpenDialog,
  openDialogCalls,
  stubSaveDialog,
  stubMessageBox,
  messageBoxCalls,
};
