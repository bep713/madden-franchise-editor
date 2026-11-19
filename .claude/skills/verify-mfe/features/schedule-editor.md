# Schedule editor

A user opens the Schedule page of a franchise file, picks a week from the week toolbar, and edits each game's away team, home team, day and time. Teams on bye are listed. The page has a Default (card) view and a Table view, and "View in table editor" opens the game's SeasonGame (`4146`) row in a new tab.

## Sub-features

- `weeks` shows 28 week buttons, with `P1` selected first and 16 games in week `1`.
- `edit-game` sets the day, time and team for a game.
- `autosave` writes edits straight to disk when auto-save is on. When it's off, edits wait for Save.
- `views` toggles between the Default and Table views. The choice is remembered.
- `bye` shows a "Bye:" note that lists the teams on bye.
- `view-in-table` opens a `4146 - SeasonGame` tab with the game's row selected.

## How to get to it (user POV)

- Click the `Schedule` tab.
- Click "Open the schedule editor" on the Welcome page's Get Started card (shown only for files with a schedule).

## Driving it with drive.js

Preconditions:

- A file is open (see [open-file](./open-file.md)).
- For autosave, run with `--prefs '{"general":{"autoSave":[true]}}'`.

- **Open.** Call `await models.welcome.openScheduleEditor()` (or `models.nav.openTab("Schedule")`), then `await models.schedule.waitForLoad()`. `(await models.schedule.weekButtons()).length === 28` and `selectedWeek() === "P1"`.
- **Pick week.** Call `await models.schedule.selectWeek("1")`. `(await models.schedule.games()).length === 16`. Each game is `{ recordIndex, away, home, day, time, played }`. Take `shot("week-1")`.
- **Edit.** Call `setDay(0, "Monday")`, `setTime(0, "21:05")` and `setTeam(0, "away", "SF")`. Pick values that differ from the current ones. `games()[0]` shows the new values.
- **Persisted.** With auto-save on, poll `readSavedTable(sandbox.careerPath, 4146, ["AwayTeam","HomeTeam","DayOfWeek","TimeOfDay"])` (timeout 30000) until record `recordIndex` has `DayOfWeek` = `Monday` and `TimeOfDay` = `1265` (21*60+5). With auto-save off, the file is unchanged until `app.clickMenuItem("Save")`.
- **View in table.** Call `setView("Table")`, then `viewInTable(0)`, then `nav.waitForActiveTab("4146 - SeasonGame")`. The table editor loads at the game's row.

## Gotchas

- `AwayTeam` and `HomeTeam` on disk are encoded references to the Team table (`7482`), not abbreviations. Decode them the way `schedule.spec.js` does (`decodeReference`).
- A cleared time reverts and is not written. Don't count that as a failed edit.
- The "View in table editor" button exists only in the Table view. In the Default view, use the right-click menu (`viewInTableByContextMenu`).
- Unlike v4, the v5 page has no Replace all.
