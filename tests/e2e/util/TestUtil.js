const fs = require("fs/promises");
const FilePaths = require("./FilePaths");
const SettingsManager = require("../models/SettingsManager");

const wait = async (ms) => {
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve();
    }, ms);
  });
};

const setSetting = async ({ app, callback, val }) => {
  await app._clickMenuItem("ShowPreferences");
  await wait(500);

  const settingsManagerWindow = await app.getSettingsManager();
  const settingsManager = new SettingsManager(settingsManagerWindow);
  await callback(settingsManager, val);
  await settingsManager.clickContinue();
  await settingsManager.clickContinue();
};

module.exports = {
  setAutoSave: async (app, val) => {
    await setSetting({
      app,
      callback: async (settingsManager, val) =>
        await settingsManager.setAutoSaveSetting(val),
      val,
    });
  },

  setAutoUnempty: async (app, val) => {
    await setSetting({
      app,
      callback: async (settingsManager, val) =>
        await settingsManager.setAutoUnemptySetting(val),
      val,
    });
  },

  setAutoOpenExcel: async (app, val) => {
    await setSetting({
      app,
      callback: async (settingsManager, val) =>
        await settingsManager.setOpenExcelAfterExportSetting(val),
      val,
    });
  },

  overwriteTestCareer: async () => {
    // Overwrite the test file so that we never change the pristine career file.
    // It will always start with the same state.
    const pristineCareer = await fs.readFile(FilePaths.m22.career.pristine);
    await fs.writeFile(FilePaths.m22.career.test, pristineCareer);
  },

  wait,
};
