module.exports = {
  enterFilePath: async (page, selector, path) => {
    const textbox = page.locator(selector);
    await textbox.evaluate((el) => el.classList.remove("hidden"));
    await textbox.fill(path);
    await textbox.evaluate((el) => el.classList.add("hidden"));
    await page.keyboard.press("Enter");
  },

  sendSaveKeyboardShortcut: async (page) => {
    await page.keyboard.press("Control+s");
  },

  sendUndoKeyboardShortcut: async (page) => {
    await page.keyboard.press("Control+z");
  },

  sendRedoKeyboardShortcut: async (page) => {
    await page.keyboard.press("Control+y");
  },
};
