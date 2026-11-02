// The React common-file prompt (Welcome/components/CommonFileModal), v4's
// #ftc-override-modal.
class CommonFileModal {
  constructor(window) {
    this.window = window;
    this.dialog = window.getByRole("dialog", { name: "Set File Parameters" });
    this.locators = {
      gameYear: this.dialog.getByLabel("Game Year"),
      gameType: this.dialog.getByLabel("Game Type"),
      saveAsDefault: this.dialog.getByLabel("Make these my default choices"),
      confirm: this.dialog.getByRole("button", { name: "Confirm" }),
    };
  }

  async waitForOpen() {
    await this.dialog.waitFor();
  }

  async waitForClose() {
    await this.dialog.waitFor({ state: "hidden" });
  }

  async getGameYear() {
    return this.locators.gameYear.inputValue();
  }

  async getGameType() {
    return this.locators.gameType.inputValue();
  }

  // year: "22", type: "madden" | "college" (option values)
  async choose(year, type) {
    await this.locators.gameYear.selectOption(year);
    await this.locators.gameType.selectOption(type);
  }

  async setSaveAsDefault(checked) {
    await this.locators.saveAsDefault.setChecked(checked);
  }

  async confirm() {
    await this.locators.confirm.click();
    await this.waitForClose();
  }

  async cancel() {
    await this.window.keyboard.press("Escape");
    await this.waitForClose();
  }
}

module.exports = CommonFileModal;
