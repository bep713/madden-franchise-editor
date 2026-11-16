const { poll } = require("../../util/poll");

// The React Schedule page (routes/Schedule)
class ScheduleEditorPage {
  constructor(window) {
    this.window = window;
    this.locators = {
      weekBar: this.window.getByRole("toolbar", { name: "Week" }),
      weekButtons: this.window.locator(
        '[role="toolbar"][aria-label="Week"] button[data-week]',
      ),
      selectedWeek: this.window.locator(
        'button[data-week][aria-pressed="true"]',
      ),
      // Cards in the default view, rows in the table one
      gameRows: this.window.locator("[data-record-index]"),
      gameList: this.window.locator('[role="list"][data-view]'),
      byeTeams: this.window.locator("[data-bye-teams]"),
      // A failed write; the load error has data-error instead
      errorAlert: this.window.locator('[role="alert"]'),
      loadError: this.window.locator("[data-error]"),
    };
  }

  async waitForLoad() {
    await this.locators.weekBar.waitFor();
  }

  // [{ index, abbreviation, name }] in order
  async weekButtons() {
    return this.locators.weekButtons.evaluateAll((buttons) =>
      buttons.map((button) => ({
        index: Number(button.getAttribute("data-week")),
        abbreviation: button.textContent,
        name: button.title,
      })),
    );
  }

  // "default" | "compact"
  async view() {
    return this.locators.gameList.getAttribute("data-view");
  }

  // label: "Default" | "Table"
  async setView(label) {
    await this.window
      .getByRole("group", { name: "View" })
      .getByRole("button", { name: label })
      .click();
  }

  // The abbreviations in the bye note, [] when there is none
  async byeTeams() {
    if ((await this.locators.byeTeams.count()) === 0) return [];
    const text = await this.locators.byeTeams.innerText();
    return text
      .replace(/^Bye:\s*/, "")
      .split(",")
      .map((abbr) => abbr.trim());
  }

  async selectWeek(abbreviation) {
    const week = (await this.weekButtons()).find(
      (w) => w.abbreviation === abbreviation,
    );
    if (!week) throw new Error(`No week ${abbreviation}`);
    await this.window.locator(`button[data-week="${week.index}"]`).click();
    await poll(
      () => this.selectedWeek(),
      (selected) => selected === abbreviation,
      { message: `Week ${abbreviation} was not selected` },
    );
  }

  // The selected week's abbreviation
  async selectedWeek() {
    return this.locators.selectedWeek.evaluate(
      (button) => button.textContent,
    );
  }

  // By SeasonGame record, which stays put when an edit re-sorts the week
  _row(recordIndex) {
    return this.window.locator(`[data-record-index="${recordIndex}"]`);
  }

  // The games of the selected week, in the order shown. time is "HH:mm".
  async games() {
    return this.locators.gameRows.evaluateAll((rows) =>
      rows.map((row) => {
        const value = (label) =>
          row.querySelector(`[aria-label="${label}"]`)?.value;
        return {
          recordIndex: Number(row.getAttribute("data-record-index")),
          away: value("Away team"),
          home: value("Home team"),
          day: value("Day"),
          time: value("Time"),
          played: row.getAttribute("data-played") === "true",
        };
      }),
    );
  }

  timeInput(recordIndex) {
    return this._row(recordIndex).getByLabel("Time");
  }

  // side: "home" | "away". Types into the team autocomplete; Enter picks
  // the exact match, which sorts first.
  async setTeam(recordIndex, side, abbreviation) {
    const label = side === "home" ? "Home team" : "Away team";
    const input = this._row(recordIndex).getByRole("combobox", { name: label });
    await input.fill(abbreviation);
    await input.press("Enter");
  }

  // day: the DayOfWeek name, e.g. "Monday"
  async setDay(recordIndex, day) {
    await this._row(recordIndex).getByRole("combobox", { name: "Day" }).selectOption(day);
  }

  // value: "HH:mm"; committed with Enter
  async setTime(recordIndex, value) {
    const input = this.timeInput(recordIndex);
    await input.fill(value);
    await input.press("Enter");
  }

  async viewInTable(recordIndex) {
    await this._row(recordIndex)
      .getByRole("button", { name: "View in table editor" })
      .click();
  }

  async viewInTableByContextMenu(recordIndex) {
    await this._row(recordIndex).click({ button: "right", position: { x: 4, y: 4 } });
    await this.window
      .getByRole("menuitem", { name: "View in table editor" })
      .click();
  }

  async errorAlert() {
    if ((await this.locators.errorAlert.count()) === 0) return null;
    return this.locators.errorAlert.innerText();
  }
}

module.exports = ScheduleEditorPage;
