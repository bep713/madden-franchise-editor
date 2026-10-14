class ScheduleEditorPage {
  constructor(window) {
    this.window = window;
    this.locators = {
      games: this.window.locator(".games-wrapper .game"),
      loadingSpinner: this.window.locator(".loader-wrapper"),
    };
  }

  async waitForScheduleToLoad() {
    await this.locators.games.first().waitFor();
    await this.locators.loadingSpinner.waitFor({ state: "hidden" });
  }

  async getDayOfGame(gameIndex) {
    return this._daySelector(gameIndex).locator(".selectr-label").innerText();
  }

  async setDayOfGame(gameIndex, day) {
    const daySelector = this._daySelector(gameIndex);
    await daySelector.click();
    await daySelector.locator(`.selectr-option:text-is("${day}")`).click();
  }

  _daySelector(gameIndex) {
    return this.locators.games
      .nth(gameIndex)
      .locator(".day-wrapper .selectr-container");
  }
}

module.exports = ScheduleEditorPage;
