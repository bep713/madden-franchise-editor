# 04h1: Main + v4 fixes

Index: [04h-schedule.md](04h-schedule.md). Independent of the React steps.

**Touch:** `main/utils/scheduleFiles.js` (new), `main.js` (the `schedules:list` / `schedules:read` handlers, ~line 965), `renderer/js/franchise/FranchiseSchedule.js`, `tests/unit/scheduleFiles.test.js` (new).

## Changes

### `schedules:read` path check (both UIs)
- New `main/utils/scheduleFiles.js` exports:
  - `listScheduleFiles(dir): string[]`: `readdirSync(dir)` filtered to `/^\d{4}\.json$/` and reversed, so the order is the same as today (newest first). `[]` on error.
  - `readScheduleFile(dir, filename): object | null`: returns `null` unless `filename` is a string matching `/^\d{4}\.json$/`. Otherwise it reads and parses `path.join(dir, filename)`, and returns `null` on any error. The strict name pattern rules out `..`, separators and absolute paths, so no `path.resolve` check is needed.
- `main.js`: both handlers call these with `path.join(__dirname, "schedules")`. The channel names and return shapes don't change.

### v4: team list per load (`FranchiseSchedule.js`)
- Constructor: `this._teamData = { teams: teamData.teams.map((team) => ({ ...team })) }` instead of the shared module object. A shallow copy is enough: the code only sets top-level props (`referenceIndex`, `existsInTeamTable`) and pushes new teams. `nameMatchList` arrays are only read.

### v4: bad team reference guard (`FranchiseSchedule.js`, the `seasonGameData.records.forEach` block)
- Before indexing `teamTableData.records[recordIndex]`, skip the assignment if the record is missing, so `_homeTeam` / `_awayTeam` stay `null` and `getGamesInWeek` already hides the game. `console.warn` once per bad game with its index.
- Also make `getGamesInWeek` treat `undefined` like `null` (`game.homeTeam != null`). A team row that matches nothing returns `undefined` from `_getTeamByFullName`, which slips through `!== null` and then crashes on `.logoPath`.

Nothing else in v4 changes. Replace all stays as it is.

## Verification
- `tests/unit/scheduleFiles.test.js` (node:test, a temp dir with `2021.json`, `2020.json`, `notes.txt`):
  - list: `["2021.json", "2020.json"]`, no `notes.txt`. A missing dir → `[]`.
  - read: a valid name → the parsed object; `"../package.json"`, `"..\\x.json"`, `"C:\\x.json"`, `"2021.JSON"`, `"x.json"`, `123`, `undefined` → `null`; a malformed JSON file → `null`.
- `npm run test:unit`.
- `npm run build:renderer` (the v4 bundle still builds). The v4 e2e waits for 04h6's full run.
