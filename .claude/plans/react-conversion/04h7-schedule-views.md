# 04h7: Schedule page layout, views and polish

Index: [04h-schedule.md](04h-schedule.md). Follows 04h6 (uncommitted). User feedback after trying 04h5.

## Goal
1. The orange header runs edge to edge, like Schema Management.
2. No page-level horizontal scroll. The page never scrolls as a whole: the header, week bar and bye note stay put and only the games list scrolls (vertically).
3. Two views, picked in the header (right side): **Default** (v4-like cards in a responsive grid, new) and **Compact** (today's one game per row). Default is the default. A third **Team** view is planned only (see Future work).
4. Dropdown arrow no longer overlaps the text (fixed in the shared `Dropdown`).
5. Time uses a native `<input type="time">` instead of free text.
6. The week bar drops its game-count badge.
7. A "Bye:" note below the games lists the teams with no game that week.

## Decisions
- **Header**: `ScheduleEditor` renders `<Headline text='Schedule' actions={<ViewSwitch/>}/>` as the first child of `.page`, outside `<main>` (the SchemaManagement pattern). `Headline` already has an `actions` slot, right-aligned.
- **Scrolling**: `.page` flex column, `height: 100%`. `<main>` becomes a flex column with `min-height: 0; overflow: hidden`. Its children: banners, `WeekBar` (`flex-shrink: 0`), the games container (`flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden`), the bye note (`flex-shrink: 0`). The week bar stays **one row with its own horizontal scrollbar** (v4 parity, confirmed): `overflow-x: auto` on the bar, and `<main>`/the bar get `min-width: 0` so the bar's width never pushes the page wider. The `scrollIntoView` effect stays.
- **View switch**: a small segmented control `components/ViewSwitch/ViewSwitch.tsx` in the Schedule folder: `role='group' aria-label='View'`, one `<button aria-pressed data-view>` per view, white-on-orange styling to sit in the header. Props: `{ views: readonly { value: ScheduleView; label: string }[]; value; onChange }`. `ScheduleView = 'default' | 'compact'` exported from `scheduleModel.ts`.
- **Remembered view**: `usePreference<ScheduleView>('schedule.view', 'default')`. The store accepts any key (no schema entry needed; not shown in Settings). An unknown stored value falls back to `'default'`.
- **Default view** = new `components/GameCard/GameCard.tsx`, same props as `GameRow`. Layout copies v4's card: a 2×2 grid, away team | day on row 1, home team | time on row 2 (day/time right-aligned), "Final a–h" and the view-in-table icon button in the card's corner. Cards sit in a CSS grid `repeat(auto-fill, minmax(300px, 1fr))` with 1 px borders like v4 (no checkerboard). Root carries `data-record-index` and `data-played` exactly like `GameRow`, and has the same right-click menu, so the e2e page model works for both views.
- **Shared menu**: move `RowMenu` out of `GameRow.tsx` into `components/GameMenu/GameMenu.tsx` (rename `GameMenu`, keep `data-testid='game-menu-underlay'`), plus a tiny `useGameMenu()` hook returning `{ onContextMenu, menu }` so `GameRow` and `GameCard` don't duplicate the open/close state. Move the menu CSS with it.
- **Dropdown fix (component level)**: `components/Dropdown/Dropdown.module.css` `.dropdown` gets `padding-right: calc(var(--spacing-3) * 2 + 12px)` (arrow inset + arrow width + gap). Affects every v5 dropdown; check the table editor/settings dropdowns still look right. `TeamSelect`'s `min-width` is raised if `MIA`/`WAS` still clip at the new padding.
- **Time input** (v4 uses `<input type="time">`, `scheduleService.js:339`; confirmed): `TimeInput` renders a plain `<input type='time' step={60}>` styled with `BaseFormInput`'s `.input`/`.inputElement` classes (Textbox forces a text value prop; a native time input is simpler bare). Display format follows the OS locale (12-hour on en-US). Committed on blur or Enter, not on every `change`, because the native input fires `change` per segment and each commit is a file write. An empty value (user cleared a segment) reverts on blur and writes nothing. Escape reverts. `aria-invalid` and the error state go away (the native input can't hold an invalid time).
  - `scheduleModel.ts`: replace `formatTime12` / `parseTime12` with `minutesToTimeValue(minutes): string` (`"HH:mm"`, wraps like `formatTime12` did) and `timeValueToMinutes(value): number | null` (`null` for `""` or malformed). Both are only used by `TimeInput`.
  - 04h's "Times are shown and entered in 12-hour format" decision is updated to "native time input, OS locale format".
- **Week bar**: remove the `counts` prop and badge. `weekGameCounts` is deleted from the model (its only caller goes away).
- **Bye teams**: `byeTeams(games, week): ScheduleTeam[]` in `scheduleModel.ts`. Only for `PreSeason` and `RegularSeason` weeks with at least one game; otherwise `[]`. The candidate set is every team that plays at least one game of that `seasonWeekType` in the season (so Pro Bowl/free-agent/custom rows in the Team table that never play aren't listed as on bye). Result = candidates − teams in this week's games, sorted by abbreviation. Rendered under the games as `<p data-bye-teams>Bye: ARI, BAL</p>` (abbreviations), hidden when empty. Shown in both views.

## Files
- `routes/Schedule/ScheduleEditor.tsx`, `ScheduleEditor.module.scss`, `ScheduleEditor.test.tsx`
- `routes/Schedule/scheduleModel.ts`, `scheduleModel.test.ts`
- `routes/Schedule/components/WeekBar/*` (drop counts)
- `routes/Schedule/components/TimeInput/*` (native time input)
- `routes/Schedule/components/GameRow/*` (use `useGameMenu`)
- new `routes/Schedule/components/GameMenu/GameMenu.tsx`, `GameMenu.module.css` (+ the existing context-menu tests move to `GameMenu.test.tsx` or stay in GameRow's test, which now exercises the hook)
- new `routes/Schedule/components/GameCard/GameCard.tsx`, `.module.css`, `.test.tsx`
- new `routes/Schedule/components/ViewSwitch/ViewSwitch.tsx`, `.module.css`, `.test.tsx`
- `components/Dropdown/Dropdown.module.css`
- `tests/e2e/models/react/ScheduleEditorPage.js`, `tests/e2e/scripts/react/schedule.spec.js`
- `.claude/plans/react-conversion/04h-schedule.md` (step row, updated decisions, Team view in Future work)

## Edge cases
- Stored `schedule.view` is garbage → `'default'`.
- Week with games but all 32 teams playing → no bye note.
- N/A, empty, playoff and Pro Bowl weeks → no bye note.
- A team edit that makes a team play twice in a week: bye note recomputes from the optimistic games; validation stays future work.
- Native time input left half-filled (`--:-- PM`) then blurred → reverts to the stored time, nothing written.
- A re-read while the time input is focused and dirty keeps the typed value (current behaviour, kept).
- Window 1024×728: week bar scrolls horizontally inside itself, cards drop to 2–3 columns, no horizontal scrollbar on the page or the games list.

## Verification
- vitest:
  - `scheduleModel.test.ts`: `byeTeams` (regular week with byes, full week, playoff week, empty week, team that never plays excluded), `minutesToTimeValue` / `timeValueToMinutes` (wrap, padding, `""`, malformed). Remove the 12h and `weekGameCounts` tests.
  - `TimeInput.test.tsx`: rewritten for the native input (commit on blur/Enter, no write on same value, empty reverts, Escape reverts, follows parent value, keeps dirty value on re-read).
  - `WeekBar.test.tsx`: drop the count test.
  - `GameCard.test.tsx`: same cases as `GameRow.test.tsx` (edits, played score, view-in-table button + context menu).
  - `ViewSwitch.test.tsx`: pressed state, onChange.
  - `ScheduleEditor.test.tsx`: default view renders cards, switching to Compact renders rows and calls `preferences.set({ schedule: { view: 'compact' } })`, stored `'compact'` opens in Compact, bye note shown/hidden.
- e2e (`react/schedule.spec.js`, page model):
  - Page model: `games()`/`setTime()`/`timeInput()` locate the time by `[aria-label="Time"]` (no textbox role); `time` values become `"HH:mm"`. `setTime(i, "21:05")` fills then presses Enter. `weekButtons()` drops `count`. Add `setView(name)`, `view()`, `byeTeams()`.
  - Update the existing tests to the new time format; the "week 1 has 16 games" assertion counts `games()` instead of the badge.
  - Replace "an invalid time is flagged and not written" with "a cleared time reverts and is not written".
  - New: switching to Compact and back keeps editing working and the choice is persisted (`preferences.json` via the launch's userData, or relaunch-free: seed `preferences: { schedule: { view: 'compact' } }` and check rows are shown).
  - New: a regular-season week with fewer than 16 games lists `32 − 2×games` teams on bye, and none of them appear in that week's games.
  - Run the edit tests in the **Default** view (the default) so the new cards are covered; one test in Compact.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`, then `npm run build:react && npm run e2eTest:react`.
- Manual look at 1024×728 (`E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728` or the run skill): header edge to edge, no horizontal scrollbar, team abbreviations not clipped.

## Future work: Team view (not in this step)
- Third `ScheduleView` value `'team'`, a team picker (TeamSelect) next to the switch or above the list.
- One row per week from `SCHEDULE_WEEKS` (P1…SB): week name, `vs`/`@` opponent (editable TeamSelect), day, time, final score; weeks with no game show "Bye".
- Reuses `gamesInWeek` + a `gamesForTeam(games, team)` helper; edits go through the same `updateGame`.
