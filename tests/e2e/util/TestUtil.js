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

  wait,
};
