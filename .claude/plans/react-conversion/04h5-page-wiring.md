# 04h5: Page wiring

Index: [04h-schedule.md](04h-schedule.md). Needs 04h3 and 04h4. After this step, Schedule works in v5.

**Touch:** `src/renderer/src/routes/Schedule/ScheduleEditor.tsx` (new), `ScheduleEditor.module.scss` (new), `ScheduleEditor.test.tsx` (new), `src/renderer/src/App.tsx`, `data/navigation.ts`, `src/renderer/src/hooks/useOpenFile.ts` (+ its test), and `src/renderer/src/tabs/editorTabs.ts` only if a key constant is needed (`SCHEDULE_KEY = 'schedule-editor'`, next to `SCHEMA_MANAGEMENT_KEY`).

## Changes
- `data/navigation.ts`: `implemented: true` on `schedule-editor`.
- `App.tsx`: `<Route path='schedule-editor' element={<ScheduleEditor />} />`.
- `ScheduleEditor`:
  - Reads `openFile` from `FranchiseFileContext`. With no file (shouldn't happen, since the tab only shows with one), render nothing.
  - `useSchedule(openFile.fileId, openFile.revision, openFile.metadata.gameYear)`.
  - `const [week, setWeek] = useState(0)`: P1 on mount, kept across re-reads.
  - Uses the shared `Layout`/`Headline` the way the other routes do. Headline "Schedule". `WeekBar` on top, then the list of `GameRow`s for `gamesInWeek(games, weeks[week])`. An empty week says "No games this week."
  - Loading: `useLoader` (as in SchemaManagement), shown only after a short delay so quick loads don't flash. Check whether `useLoader` already has a delay option.
    - **Done as:** it has none, so `ScheduleEditor` shows it from a timer (`LOADER_DELAY_MS = 300`).
  - Error states (improvement 3): `schema` → the message plus a "Go to Schemas" link that calls `selectTab(SCHEMA_MANAGEMENT_KEY)`. `missing-table` / `load` → the message plus "Retry" (`reload`).
  - `writeError` (improvement 2): a dismissible inline error at the top of the page, with `role="alert"`.
  - View in table editor: `openTableTab(schedule.seasonGameTableId, <name>, { selection: { row: game.recordIndex, col: 0 } })`. Name the tab after the table the same way the references modal does (`tableTitle` from `@renderer/utils/tableTitle`, which takes the table list entry from `openFile.tables`). The new tab is active (v4 switches to the table editor).
- `useOpenFile.ts`: add `else if (defaultEditor === 'open-schedule')`. If `getNavigationItems(file.metadata)` has `schedule-editor`, `editorTabs.selectTab('schedule-editor', file)`; otherwise stay on Home. Remove the TODO.

## Verification
- `ScheduleEditor.test.tsx` (mock `useSchedule` or `franchiseAPI`; whichever the existing route tests do):
  - Renders the week bar and P1's games. Clicking week 1 shows its games.
  - `onEdit` from a row reaches `updateGame` with the record index.
  - The `writeError` alert shows and can be dismissed.
  - The schema error's link calls `selectTab('schema-management')`. Retry calls `reload`.
  - View in table editor calls `openTableTab` with the SeasonGame id and `{ row, col: 0 }`.
- `useOpenFile.test.ts`: `open-schedule` on a Madden franchise file selects `schedule-editor`. On a common file or a CFB file it stays on Home.
- `editorTabs.test.ts` / `EditorTabsContext.test.tsx`: update any test that relies on Schedule being unimplemented (`isImplemented`).
  - **Done as:** no page is a stub any more, so the two stub tests mark Schedule `implemented: false` in their state (`withStubSchedule`). Added `SCHEDULE_KEY`. `react/tabs.spec.js` (~line 58) still expects the stub and fails until 04h6. `vite build` now emits the team logos (04h4's check).
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`.
- Manual (`npm run dev:react`): open the M22 test career, Schedule → change a team, day and time, switch to "Open Table..." → SeasonGame shows the new values. Also try the 1024x728 size.
