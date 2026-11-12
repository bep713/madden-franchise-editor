# 04h3: `useSchedule` hook

Index: [04h-schedule.md](04h-schedule.md). Needs 04h2.

**Touch:** `src/renderer/src/routes/Schedule/useSchedule.ts` (new), `useSchedule.test.tsx` (new).

## Interface
```ts
type ScheduleState =
    | { status: 'loading' }
    | { status: 'ready'; schedule: Schedule }
    | { status: 'error'; kind: 'schema' | 'missing-table' | 'load'; message: string };

function useSchedule(fileId: string | undefined, revision: number | undefined): {
    state: ScheduleState;
    // Optimistic; on failure re-reads and sets writeError
    updateGame: (recordIndex: number, edit: GameEdit) => Promise<void>;
    writeError: string | null;
    dismissWriteError: () => void;
    reload: () => void;
};
```

## Load
- Runs on mount and whenever `fileId`/`revision` changes. A request counter ignores responses that are out of date, as `useSchemaFields` does. Check that file for the existing pattern and reuse it.
- Steps:
  1. `getMetadata` → `gameYear` (or use `openFile.metadata` from the caller. Prefer passing `gameYear` in as an argument, to save a round trip, if the page has it).
  2. `findTablesByName` for `SeasonGame` and `Team`, in parallel. If SeasonGame is missing, or there's no Team table with `recordCount > 1`, the result is `missing-table`.
  3. `readTableData(SeasonGame, SEASON_GAME_FIELDS)` and `readTableData(Team, TEAM_FIELDS)`, in parallel. An `{ error }` result means `load`. `usingGenericSchema` on either one means `schema`.
  4. Only when `gameYear < 21`: `schedule.getStartTimes(fileId)`. If it throws, the result is `load`.
  5. `buildTeams` + `buildGames`. `skipped > 0` gives one `console.warn`.
- v5 doesn't read Scheduler, Scheduler.Appointment or GameEvent (v4 reads them only for Replace all and the dead appointment map). `getStartTimes` reads Scheduler in main for the old-year filter.
- During a re-read after a revision bump, keep the previous `ready` state instead of going back to `loading`, so the selected week and scroll survive. The page owns the week index, so this only matters for flicker.

## Writes
- `updateGame`: build the writes with the 04h2 builders, set the new game in state right away, then `await writeBulkTableCells(fileId, writes)`.
- Failure (`!success`, any `results[i].success === false`, or a throw): set `writeError` to the error text and re-read through the load path (state kept as above). v4 used `showMessageBox`. v5 shows an inline banner on the page instead (04h5).
- No local queue: main runs writes one at a time per file, and IPC keeps their order.

## Verification
- `useSchedule.test.tsx` with `window.franchiseAPI` mocked (`renderHook`, small fake records):
  - The happy path for M22: no `getStartTimes` call, and the result is `ready` with the expected games.
  - M20: `getStartTimes` is called and the season-year filter applies. When it throws, the result is `error/load`.
  - A missing SeasonGame table gives `missing-table`. `usingGenericSchema` gives `schema`. A `readTableData` `{ error }` gives `load`.
  - A stale response (bumping the revision mid-load) is ignored.
  - `updateGame` sends the exact `CellWrite[]` and updates the state before the promise resolves. On a failed write, `writeError` is set and `readTableData` is called again. `dismissWriteError` clears it.
- `npm run typecheck && npm run lint && npm run test:react`.
