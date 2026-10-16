const util = require("../util/UiTestUtil");

class SettingsManager {
  constructor(window) {
    this.window = window;
    this.locators = {
      previousButton: this.window.locator(".back-btn"),
      continueButton: this.window.locator(".continue-btn"),
      autoSaveCheckbox: this.window.locator("#autoSave"),
      autoUnemptyCheckbox: this.window.locator("#autoUnempty"),
      openExcelAfterExportCheckbox: this.window.locator(
        "#openExcelAfterImport",
      ),
      updateChannelSelect: this.window.locator("#updateChannel"),
    };
  }

  async clickContinue() {
    await this.locators.continueButton.click();
  }

  async clickPrevious() {
    await this.locators.previousButton.click();
  }

  async _setCheckboxSetting(locator, value) {
    if (value) {
      await locator.check();
    } else {
      await locator.uncheck();
    }
  }

  async setAutoSaveSetting(autoSave) {
    await this._setCheckboxSetting(this.locators.autoSaveCheckbox, autoSave);
  }

  async setOpenExcelAfterExportSetting(open) {
    await this._setCheckboxSetting(
      this.locators.openExcelAfterExportCheckbox,
      open,
    );
  }

  async setUpdateChannel(value) {
    await this.locators.updateChannelSelect.selectOption(value);
  }

  async getUpdateChannel() {
    return await this.locators.updateChannelSelect.inputValue();
  }

  async setAutoUnemptySetting(autoUnempty) {
    await this._setCheckboxSetting(
      this.locators.autoUnemptyCheckbox,
      autoUnempty,
    );
  }
}

module.exports = SettingsManager;
