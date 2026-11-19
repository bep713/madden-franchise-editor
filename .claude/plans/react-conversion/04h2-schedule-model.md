# 04h2: Schedule model (pure TS)

Index: [04h-schedule.md](04h-schedule.md). Pure functions, with no React and no IPC, so every rule is tested in vitest.

**Touch:** `src/renderer/src/routes/Schedule/scheduleModel.ts` (new), `scheduleModel.test.ts` (new), `src/shared/types/schedule.ts` (new) + its export in `src/shared/types/index.ts` (check how the index re-exports), `src/renderer/src/preload.d.ts`.

## Types (`src/shared/types/schedule.ts`)
- `ScheduleStartTimes { currentTime: string; seasonYear: number; epochStart: string; preseasonStart: string; regularSeasonStart: string }`, the shape `schedule:get-start-times` returns today.
- `TableSummary`: reuse whatever `findTablesByName` already returns in main (check `franchise:find-tables-by-name` in `FranchiseFileManager.js`: at least `{ id, name, recordCount }`). Add a type only if `src/shared/types` has none.

## `preload.d.ts`
Add the two methods React will start calling, if they aren't declared yet:
- `findTablesByName(fileId: string, tableName: string): Promise<TableSummary[]>`
- `schedule: { getStartTimes(fileId: string): Promise<ScheduleStartTimes> }`

## Model (`scheduleModel.ts`)
Data imports: `@data/teamData.json`, `@data/dayOfWeekData.json`, `@data/seasonWeekData.json`. Never change them: every builder returns new objects.

- Types:
  - `ScheduleTeam { key: string; abbreviation: string; city: string; nickname: string; logoPath?: string; referenceIndex: number; custom: boolean }`. `key` is unique per team in a load (the abbreviation, plus `#row` when abbreviations collide).
  - `ScheduleDay { name: string; abbreviation: string }` (from `dayOfWeekData`).
  - `ScheduleWeek { index: number; abbreviation: string; weekName: string; weekIndex: number; seasonWeekType?: string }`, all 28 from `seasonWeekData`, in order.
  - `ScheduleGame { recordIndex: number; homeTeam: ScheduleTeam; awayTeam: ScheduleTeam; day?: ScheduleDay; timeOfDay: number; homeScore: number; awayScore: number; played: boolean; seasonWeek: number; seasonWeekType: string }`.
  - `Schedule { teams: ScheduleTeam[]; games: ScheduleGame[]; weeks: ScheduleWeek[]; seasonGameTableId: number; teamTableId: number }`.
- `SEASON_GAME_FIELDS`: the same 11 fields v4 reads. `TEAM_FIELDS = ['ShortName', 'LongName', 'DisplayName']`.
- `buildTeams(teamRecords): ScheduleTeam[]`: for each row, match `"${LongName} ${DisplayName}"` against `teamData` `nameMatchList`. A match takes its metadata, and anything else becomes a custom team (`ShortName`, no `logoPath`, `custom: true`). Every team gets `referenceIndex = row`. Skip empty records (check `recordMeta` / `emptyRecordIndices` from `readTableData`, which the caller passes in). Sorted by abbreviation (v4).
- `buildGames({ seasonGameRecords, emptyIndices, teams, teamTableId, gameYear, seasonYear? }): { games: ScheduleGame[]; skipped: number }`:
  - Skips empty, `IsPractice`, and (when `gameYear < 21`) `SeasonYear !== seasonYear`.
  - Resolves each team with `parseReference`. It needs `tableId === teamTableId` and a team with that `referenceIndex`. If not, the game is counted in `skipped` and left out. A null reference (`0` × 32) is also left out, but isn't counted.
  - `day` from `DayOfWeek` via `name`. `played = HomeScore > 0 || AwayScore > 0`. While implementing, check the SeasonGame schema in the fixture for a status field (e.g. `GameStatus`, `IsPlayed`). If there is one, use it and note it here.
    - **Found:** SeasonGame has a `GameStatus` enum in every schema M19–M27 (`Unscheduled`, `Unplayed`, `AwayWon`, `HomeWon`, `Tied`, …). In the M22 fixture the 15 scored games are `AwayWon`/`HomeWon` and the rest `Unplayed`/`Unscheduled`. `SEASON_GAME_FIELDS` adds `GameStatus` (12 fields), and `played` is `GameStatus` ∈ {`AwayWon`, `HomeWon`, `Tied`, `FirstComplete_`, `LastComplete_`}, falling back to the score test when the field is missing.
- `gamesInWeek(games, week): ScheduleGame[]`: `seasonWeek === week.weekIndex && seasonWeekType === week.seasonWeekType`, in record order (v4). Always `[]` for N/A (no type).
- `weekGameCounts(games, weeks): number[]`, for the badge.
- Write builders, each returning `CellWrite[]`:
  - `teamWrites(schedule, game, side: 'home' | 'away', team)` → `{ tableId: seasonGameTableId, recordIndex, fieldName: 'HomeTeam' | 'AwayTeam', value: calculateReferenceBinary(teamTableId, team.referenceIndex) }`.
  - `dayWrites(schedule, game, day)` → `DayOfWeek: day.name`.
  - `timeWrites(schedule, game, minutes)` → `TimeOfDay: minutes`.
  - `applyGameEdit(game, edit): ScheduleGame`: the optimistic local update, for the hook. `edit` is a union `{ kind: 'team'; side; team } | { kind: 'day'; day } | { kind: 'time'; minutes }`. One `editWrites(schedule, game, edit)` dispatcher can replace the three builders above. Pick whichever keeps the hook simplest.
    - **Done as:** one `editWrites(schedule, game, edit)` dispatcher, no separate builders. Days and weeks are exported as `SCHEDULE_DAYS` / `SCHEDULE_WEEKS`. `findTablesByName` is declared as `Promise<TableSummary[] | ErrorResult>`, since main returns `{ error }` on failure.
- 12-hour time:
  - `formatTime12(minutes): string` → `"8:20 PM"`, `"12:00 PM"`, `"12:05 AM"`. Values outside 0–1439 are shown mod 1440.
  - `parseTime12(text): number | null` accepts `"8:20 PM"`, `"8:20pm"`, `"8:20 p"`, `" 08:20 PM "`, and also 24-hour `"20:20"` (no meridiem, hour 0–23). It rejects hour > 12 with a meridiem, minutes > 59, and anything else (`null`).

## Verification
- `scheduleModel.test.ts`:
  - `buildTeams`: an NFL match by an alternate name (`"St. Louis Cardinals"` → ARI), a custom team, colliding abbreviations get unique keys, empty records skipped, sorted, and the imported `teamData` is unchanged afterwards (deep-equal against a snapshot taken before).
  - `buildGames`: practice skipped. The season-year filter applies only below 21. A reference to another table and an out-of-range row are skipped and counted. A null reference is skipped without being counted. `played` is set.
  - `gamesInWeek`: preseason and regular weeks with the same `weekIndex` stay apart, and N/A is empty.
  - Write builders: exact `CellWrite` values. The reference binary round-trips through `parseReference`.
  - `formatTime12` / `parseTime12`: the cases above, plus a round-trip for every 5th minute of the day.
- `npm run typecheck && npm run lint && npm run test:react`.
