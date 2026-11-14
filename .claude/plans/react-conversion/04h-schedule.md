# 04h: Schedule page (React)

Index: [04-parity.md](04-parity.md). Also unblocks 04e's port of the schedule test in `bulk-edit.spec.js`.

## Context
v4's Schedule tab is `renderer/schedule.html`, `renderer/js/services/scheduleService.js`, `renderer/js/franchise/FranchiseSchedule.js` + `FranchiseGame.js`, and `main/handlers/scheduleHandler.js`.
- It loads data through `franchiseAPI.findTablesByName` for SeasonGame, Team, Scheduler, Scheduler.Appointment and GameEvent, then `franchiseAPI.readTableData`, plus `franchiseAPI.schedule.getStartTimes` for the epoch and season year.
- It writes each edit right away with `franchiseAPI.writeBulkTableCells`. Main's `file.on("change")` then calls `requestAutoSave` (`FranchiseFileManager.js:393-397`), so the renderer never saves.
- UI: a week bar (28 buttons from `data/seasonWeekData.json`, N/A included) and one row per game in the selected week: away team, home team, day and time. Teams and days are Selectr dropdowns with logos, and time is `<input type=time>`. Right-click → "View in table editor" opens the SeasonGame row. "Replace all" (M19/M20 only) loads `schedules/*.json` through `scheduleAPI`.

v5 uses the same preload APIs and adds no new IPC channels.

## Decisions (confirmed with the user)
- **Replace all is dropped from v5.** It has never worked in v4: `replaceAllGamesWithFile` takes off the `change` listeners before it sets fields, so nothing is written, and the appointment/epoch code is dead (`appointmentMap` is never filled). v4 keeps it as it is. `scheduleAPI` stays for v4.
- **Played games** show their final score and a "Final" marker, and stay editable.
- **Times** use a native `<input type="time">` like v4 (OS locale format), committed on Enter/blur (04h7; was a 12-hour text box). They are still stored as `TimeOfDay` minutes since midnight.
- **Week bar** is the same as v4: all 28 weeks from `seasonWeekData.json` in order, including N/A and empty weeks, with no grouping. P1 is selected when the page mounts (v4 does the same).
- **Validation** (home = away, a team playing twice in a week) is future work, not this plan.
- **Undo/redo** is future work, not this plan.
- **v4 fixes in this plan:** the `schedules:read` path check (main, shared by both UIs), the team list leaking between files in v4, and the v4 page crashing on a team reference outside the Team table. The v4 Replace-all bug is not fixed.

## Proposed improvements over v4 (please approve before 04h4/04h5)
Each one is small and isolated in its step, and can be cut without changing the rest of the plan.
1. A visible **"View in table editor" icon button** on every row, in addition to right-click. Right-click alone is hard to discover. (04h4)
2. **Failed writes re-read the schedule** from the file and show an error banner. v4 shows an error box but leaves the UI on the value that wasn't saved. (04h3)
3. The schema error links to the Schemas tab. v4 only tells the user to go there. (04h5)
4. ~~The week bar shows the game count as a small badge on each week button.~~ Removed in 04h7; replaced by a bye-teams note.

## Facts that shape the design
- Team references are 32-bit binary strings: 15 bits of table id + 17 bits of row (`src/renderer/src/utils/references.ts`, `calculateReferenceBinary` / `parseReference`). v4 splits them 16/16 and keeps the old 16-bit prefix on writes. That works for rows < 65536 but never checks that the reference points at the Team table. v5 parses with `parseReference` and writes `calculateReferenceBinary(teamTableId, recordIndex)`.
- The Team table is the first `Team` table with `recordCount > 1` (v4 parity).
- Games are matched to `teamData.json` by `"${LongName} ${DisplayName}"` against `nameMatchList`. Team rows with no match become custom teams with a placeholder logo, the `ShortName` abbreviation, and `referenceIndex` = row. v4 does this by changing the shared imported JSON. v5 builds a new list on every load.
- Games: SeasonGame records that aren't `IsPractice`. For `gameYear < 21` also only `SeasonYear === startTimes.seasonYear`. `getStartTimes` is only needed for that filter, so v5 calls it only when `gameYear < 21`.
- A week's games: `SeasonWeek === week.weekIndex && SeasonWeekType === week.seasonWeekType && home and away teams resolve`. A null team reference (`"0".repeat(32)`) or an unresolvable one hides the game (v4 parity, without the crash). N/A has no `seasonWeekType`, so it is always empty (v4 parity).
- Writable fields: `HomeTeam`, `AwayTeam` (reference binary), `DayOfWeek` (enum name, e.g. `"Monday"`, from `data/dayOfWeekData.json`) and `TimeOfDay` (minutes).
- `IN_PLACE_ACTIONS` and `openTableTab(tableId, name, { selection: { row, col: 0 } })` already exist in `tabs/EditorTabsContext.tsx` and are used by the references modal.
- `navigation.ts` already gates Schedule to Madden franchise files for every year. It only needs `implemented: true`, and `App.tsx` needs a `schedule-editor` route.
- `useOpenFile.ts:125` has a `TODO(04+): open-schedule`.
- Routes unmount on tab switch, so the page re-reads SeasonGame on every mount. That also picks up edits made in the table editor.
- Logos live in `renderer/img/team-logos/nfl/*.PNG` (36 files, 4.6 MB). v5 imports them from there with `import.meta.glob` rather than copying them (one source of truth). The NCAA logos are unused: the schedule is Madden only.

## Edge cases
- Common file, CFB file: no Schedule tab (already gated). `defaultEditor = open-schedule` on such a file stays on Home (04h5).
- Missing schemas (`usingGenericSchema` on any of the tables read): an error state with a link to Schemas. The load stops there, unlike v4, which keeps going (04h3/04h5).
- No SeasonGame or Team table, or `getStartTimes` throwing on M19/M20: an error state, with no crash (04h3).
- A game whose team row index is ≥ the Team table's record count, or whose reference points at another table: hidden from the week, logged once (04h2).
- File reload or schema change (`revision` bump) while on the page: re-read, keeping the selected week (04h3).
- File closed while on the page: the tab disappears and the route goes Home (existing tab logic).
- A write fails: banner + re-read (04h3).
- Fast edits on several rows: each edit is its own `writeBulkTableCells` call. Main runs them one at a time, and IPC keeps their order.
- An invalid time ("25:00", "abc"): the input shows an error state, reverts on blur, and writes nothing (04h4).
- Auto-save off: the edit stays in memory and the Save menu item is enabled (navigation item `menu.enable: ['Save']`, already wired through `useMenuState`).
- Window at 1024x728: game rows wrap or shrink and the week bar scrolls horizontally. No page-level horizontal scroll.

## Steps

| Step | Scope | Plan | Status |
|---|---|---|---|
| 04h1 | Main + v4 fixes: `schedules:read` path check (+ unit test), v4 per-load team list, v4 bad-reference guard | [04h1-v4-fixes.md](04h1-v4-fixes.md) | Done (`a3e5b7a`) |
| 04h2 | Pure TS model `routes/Schedule/scheduleModel.ts` (types, team list, game build, week filter, write builders, 12h time) + `preload.d.ts` + vitest | [04h2-schedule-model.md](04h2-schedule-model.md) | Done (`3927888`) |
| 04h3 | `useSchedule(fileId, revision)` hook: load, states, `updateGame` with re-read on failure + vitest | [04h3-use-schedule.md](04h3-use-schedule.md) | Done (`2d3365e`) |
| 04h4 | Components: `WeekBar`, `GameRow`, `TeamSelect`, `TimeInput`, `teamLogos.ts` + vitest | [04h4-components.md](04h4-components.md) | Done (`8c09e8c`) |
| 04h5 | Page wiring: `ScheduleEditor` route, `implemented: true`, view in table editor, `open-schedule` default editor + vitest | [04h5-page-wiring.md](04h5-page-wiring.md) | Done (`8c09e8c`) |
| 04h6 | E2E: React page model + `react/schedule.spec.js`, update `react/tabs.spec.js`, port of the bulk-edit schedule test, docs; **full e2e** | [04h6-e2e.md](04h6-e2e.md) | Done (uncommitted) |
| 04h7 | Full-width header, page doesn't scroll, Default (cards) / Compact (rows) views, native time input, Dropdown arrow padding, bye note | [04h7-schedule-views.md](04h7-schedule-views.md) | Done (uncommitted) |

## Order
- 04h1 is independent (JS only: `main.js`, `renderer/js/franchise/`, `tests/unit/`) and can run in parallel with 04h2.
- 04h2 → 04h3 → 04h4 → 04h5 → 04h6, each needing the one before. 04h4 needs only 04h2's types, so it can run in parallel with 04h3 if wanted.
- Nothing shows up for users until 04h5. Until then Schedule still does nothing in v5 (expected).
- **Tests per step:** each step runs `npm run typecheck && npm run lint && npm run test:react` (plus `npm run test:unit` for 04h1, and `npm run stylelint` once there is CSS). No e2e before 04h6. 04h6 runs `npm run build:react && npm run e2eTest:react`, then the full `npm run e2eTest` (v4 changed in 04h1).

## Future work (not planned)
- Team view: a third view showing one team's games for every week (sketch in [04h7-schedule-views.md](04h7-schedule-views.md#future-work-team-view-not-in-this-step)).
- Validation warnings: home = away, a team playing more than once in a week, a count on the week button.
- Undo/redo for schedule edits (reuse `TableEditorComponent/undoStack.ts`).
- Replace all with a bundled real schedule, done properly: one bulk write, plus appointments/epoch, for every supported year.
- Open on the current week instead of P1, and remember the selected week across tab switches.
