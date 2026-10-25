# 03a — Table pinning

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Roadmap: [plan.md](plan.md).

## Context
v4 shows pins in a bookmark bar above the table editor (`renderer/table-editor.html:12`, `TableEditorWrapper._initializePins` / `_createPinElement` / `_createAddNewPinButton`, lines 299–412). Clicking a pin selects its table, the pin's delete button removes it, and "+ Add" pins the selected table. The logic lives in `renderer/js/services/pinnedTableService.js` and persists to `pins.json` in `userData`, through `electronAPI.fs.readJson` / `writeJson` (`main.js:734`, `fs:read-json` / `fs:write-json`).

React has no pin logic. The action bar shows a "Pin" link (`FieldEditorActionBar.tsx:38`), but `FieldEditorView.handleActionClick` ignores `TableActions.PIN`.

Outcome:
- The sidebar opens with a **Pinned** section: a "Pinned" label, the pinned tables sorted by table id, then a divider. The full table list follows.
- Pinned tables also stay in their normal place in the full list. Wherever a pinned table's card appears, it has the pushpin icon and a trash button on hover that unpins it.
- A pushpin toggle button next to the search box shows or hides the Pinned section. Its state is a global preference, so it is the same after closing and reopening the editor, in any file.
- The action bar toggles Pin/Unpin for the selected table, and the sidebar updates immediately.
- Pins are read from and written to the same `pins.json` as v4, so both UIs see the same pins.

## Pin rules (same as v4)
`pins.json` format, unchanged:
```json
[{ "gameYear": 22, "gameType": "madden", "pins": [{ "tableId": 4220, "tableName": "Player", "uniqueId": 123456 }] }]
```
- Pins are grouped per `gameYear` + `gameType` (`metadata.gameYear`, `metadata.type.gameType`; a missing gameType means `"madden"`).
- A pin is identified by `uniqueId`. `tableId` is kept as a fallback key (legacy pins without `uniqueId`, or tables whose uniqueId is 0) and as a last-known-id hint.
- Opening a file reconciles the group's pins with the file's table list (`migratePins`):
  - Pin with `uniqueId`: look it up by uniqueId only. If found and `tableId` differs, update `tableId`. **`uniqueId` is never rewritten.**
  - Legacy pin without `uniqueId`: trust `tableId` only if that table has the same name; otherwise use the only table with that name, if exactly one exists. On a match, set `uniqueId` once (and `tableId`). This is the only time a pin gains a uniqueId.
  - Unmatched pins are kept unchanged in the file.
- Resolving a pin (`resolvePin`): a pin with a uniqueId never falls back to its tableId, because that id may now belong to another table.
- Untyped groups (`migrateGameTypes`): years ≤ 27 become `"madden"`. A later year takes the gameType of the first file opened for it, if that year has no typed group yet.
- Missing or unreadable `pins.json` → start from v4's `getInitialPins()` defaults (M20–M22: Player, Team, Franchise, League). A year with no group gets its default group, or an empty one.
- Write the file after open only if something changed, and after every add/remove.

## Phase 1: Pin logic as pure functions
New `src/renderer/src/utils/pins.ts`, a TypeScript port of `pinnedTableService.js` with no module state, so it can be unit tested and used from a hook:
- Types `Pin { tableId: number; tableName: string; uniqueId?: number }`, `PinGroup { gameYear: number; gameType?: string; pins: Pin[] }`, `PinsFile = PinGroup[]`. Put them in `src/shared/types/pins.ts` and export them from `@shared/types`.
- `PINS_FILENAME = 'pins.json'`, `getInitialPins()` (copied from v4), `migrateGameTypes`, `migratePins`, `resolvePin`, `pinMatches`, `findPinGroup`.
- `preparePins(allPins | null, gameYear, gameType, tables) → { allPins, changed }`: does what v4's `initialize` does (defaults, gameType migration, ensures the year's group exists, `migratePins`). Works on a `structuredClone` so React state is never mutated.
- `addPin(allPins, group key, table)` / `removePin(...)` return a new `PinsFile`. `addPin` is a no-op if the table is already pinned, and stores `uniqueId` only if it is non-zero (as v4 does).
- `getPinnedTables(pins, tables) → TableListItem[]`: resolve each pin, drop unresolved ones and duplicates, sort by `id` numerically ascending. Unresolved pins stay in `pins.json` but are not shown (v4 greys them out instead).
- Compare against React's `TableListItem.id`. v4's `pinMatches` compares `pin.tableId === table.tableId` because its table objects use `tableId`. Don't carry that naming over.
- v4 stays on `pinnedTableService.js`. The logic is duplicated until the v4 UI is removed, so keep both in step if either changes.

## Phase 2: `usePinnedTables` hook
New `src/renderer/src/hooks/usePinnedTables.ts`, taking the `OpenFranchiseFile`:
- When `fileId` changes: `electronAPI.fs.readJson(PINS_FILENAME)`, then `preparePins(...)` with the file's `tables`. If `changed`, write it back. Ignore the result if the file changed while the read was pending.
- State: the full `PinsFile`. Derived with `useMemo`: the current group's pins, `pinnedTables` (from `getPinnedTables`) and a `Set` of pinned table ids.
- Returns `{ pinnedTables, isPinned(table), togglePin(table), unpin(table) }`.
- Updates set state first, so the sidebar changes immediately, then write the whole file with `fs.writeJson`. Queue writes on a promise chain so quick clicks are written in order. Log write errors with `console.error` (v4 ignores them).
- No re-read before writing, same as v4: only the main window's table editor touches pins.

## Phase 3: "Show pinned tables" preference
- Add a non-form section to `data/preferencesSchema.json`, next to `settingsManager`: `"tableEditor": { "showPinnedTables": true }`. It is global, not per file or per game.
- Include it in the defaults in both places that build them, the same way as `settingsManager`: `main/handlers/preferencesHandler.js:231` (`getPreferenceDefaults`) and `renderer/js/services/preferencesService.js:123`. Without that, a fresh `preferences.json` has no value. `fillMissingKeys` adds the section to existing preference files on the next launch.
- The settings window doesn't show it, because only `sections[]` become form fields.
- New `src/renderer/src/hooks/usePreference.ts`: `usePreference<T>(keyPath, fallback) → [value, setValue]`.
  - Reads `electronAPI.preferences.getValue(keyPath)` on mount. Uses `fallback` until the read resolves, or if it returns `undefined`.
  - `setValue` updates state, then calls `electronAPI.preferences.set({ [section]: { [key]: value } })`. `preferences:set` writes only the keys it is given (`setMany`), so a partial object is safe.
  - Kept generic because later React settings will need the same thing.
- `TableEditor` uses `usePreference('tableEditor.showPinnedTables', true)`.
- Unit test (`tests/unit/preferences.test.js`): the defaults include `tableEditor.showPinnedTables === true`, and an older saved file without the section gets it filled in.

## Phase 4: Preload types
In `src/renderer/src/preload.d.ts`, declare:
- `electronAPI.fs.readJson(filename: string): Promise<unknown | null>`
- `electronAPI.fs.writeJson(filename: string, data: unknown): Promise<void>`
- `electronAPI.preferences.getValue(keyPath: string): Promise<unknown>`
- `electronAPI.preferences.set(prefs: Record<string, Record<string, unknown>>): Promise<void>`

These all already exist in `preload/franchisePreload.js` (lines 219 and 268), so the preload doesn't change.

## Phase 5: Sidebar
The sidebar list becomes a list of typed rows:
```ts
type SidebarRow =
  | { kind: 'pinnedLabel' }
  | { kind: 'table'; table: TableListItem; pinned: boolean; section: 'pinned' | 'all' }
  | { kind: 'divider' };
```
- `TableEditor.tsx` builds the rows from `usePinnedTables` and `showPinnedTables`:
  - Pinned section: shown only if `showPinnedTables` is on and at least one pinned table matches the filter. It holds `pinnedLabel`, the pinned tables (sorted by id; while filtering, only the pinned tables in the Fuse results), then `divider`.
  - Full list: every table, unchanged (index order, or Fuse order while filtering), each with `pinned` set from `isPinned`. Pinned tables stay in their normal place.
  - The selected highlight shows in both places, because it is based on `table.id`.
- `TableSidebar.tsx`:
  - Switch `FixedSizeList` to `VariableSizeList` (react-window 1.8.11). Row heights: table rows 63 as now, the label about 24, the divider about 13; put the exact sizes in constants. Call `listRef.current.resetAfterIndex(0)` when the rows change. Use `itemKey` = `pinned-<id>` / `all-<id>` / `label` / `divider`, so the same table in both sections has two keys.
  - The Pinned section scrolls with the list. It is not sticky, so a long pin list doesn't take up the sidebar.
  - Header: put a pushpin toggle `<button>` to the right of the search `Textbox`, with `aria-pressed={showPinnedTables}` and the title "Hide pinned tables" / "Show pinned tables". The icon is dimmed when the section is off. New prop `onTogglePinnedVisible`.
  - Table rows: a wrapper `div` (the absolutely positioned react-window `style` goes on it). Inside it go the existing select button (`TableListItem`) and, for pinned tables, a sibling trash `<button aria-label="Unpin {name}">`. A trash button can't go inside the select button, because nested `<button>`s are invalid HTML. The trash button shows on `:hover` and `:focus-within`. Its click calls the new `onUnpin(table)` prop and must not select the table. This works the same in both sections. Unpinning from the full list removes the row from the Pinned section too.
  - `pinnedLabel` row: a small "Pinned" label with the `Text` component's label style. `divider` row: a 1px rule in `--timberwolf` with vertical padding.
- `TableListItem.tsx`: new optional `table.pinned`. When set, show the pushpin icon (`@assets/icons/pushpin.svg?react`, about 10px) next to the id label, plus a modifier class (`styles.pinned`) for the pinned decoration. The decoration is the same in both sections.
- Icons: copy `renderer/img/trash.svg` to `src/renderer/src/assets/icons/trash.svg`. Size it in CSS, because the file is 512pt. Pushpin already exists in `src/renderer/src/assets/icons/` and is used for the cards and the toggle button.
- Styles in `TableSidebar.module.scss` / `TableListItem.module.css`. Use the existing color tokens and camelCase class names.

## Phase 6: Action bar
- `FieldEditorActionBar.tsx`: new prop `isPinned`. The PIN item's text becomes `isPinned ? 'Unpin' : 'Pin'`, with the same icon.
- `FieldEditorView.tsx`: new props `isPinned` and `onTogglePin`. `TableActions.PIN` calls `onTogglePin()`.
- `TableEditor.tsx` passes `isPinned(selectedTable)` and `() => togglePin(selectedTable)`. Use `selectedTable` (the `TableListItem`, which has `id`/`uniqueId`/`name`), not `TableData`.
- Pinning while the Pinned section is hidden still saves the pin and decorates the card in the full list. It doesn't turn the section back on.
- `ExpressionEditorActionBar` has no Pin item. Leave it without one.

## Phase 7: Tests and stories
- `src/renderer/src/utils/pins.test.ts` (vitest):
  - A uniqueId pin whose table moved to a new id gets its `tableId` updated, and its `uniqueId` stays the same.
  - A uniqueId pin with no matching table is kept in the file and left out of `getPinnedTables`. It never matches by tableId.
  - A legacy pin gets its uniqueId by id+name, then by unique name. With an ambiguous name, or an id reused by a table with another name, it stays unmatched.
  - Game type migration: ≤ 27 → madden; > 27 takes the opened file's type only if no typed group exists.
  - `null` file → defaults with `changed: true`; an unchanged file → `changed: false`.
  - Sorting is numeric (`999` before `4220`). `addPin` dedupes and drops a uniqueId of 0. `removePin` removes only the matching pin.
  - A `pins.json` written by v4 (fixture) round-trips with the same shape.
- Put the row building in a pure `buildSidebarRows(tables, pinnedTables, isPinned, showPinned, filtered)` helper so it can be tested without rendering. Cases:
  - With pins and the section shown: label, pins, divider, then the full list, which still contains the pinned tables.
  - Section hidden: only the full list, with pinned flags set.
  - Filter matching no pins: no label or divider.
  - No pins: no label or divider.
- `TableSidebar.test.tsx`:
  - Mock `react-virtualized-auto-sizer`, because it measures 0×0 in jsdom.
  - A pinned table renders in both sections with the pin icon.
  - The trash button in either section calls `onUnpin` but not `onTableSelect`.
  - The toggle button calls `onTogglePinnedVisible` and reflects `aria-pressed`.
- `usePreference` test: mock `window.electronAPI.preferences`. It starts at the fallback, takes the read value, and `setValue` sends the partial `{ section: { key } }` object.
- `tests/e2e/scripts/react/pins.spec.js`: port of v4's `pins.spec.js`, adapted to the sidebar. Launch with `launchWithDefaultOptions({ ui: "react", pins })`, using the React page models from [02-react-e2e.md](02-react-e2e.md).
  - Default pins show in the Pinned section.
  - Pin and unpin from the action bar, and the change is in `pins.json`.
  - Unpin with the trash button.
  - A seeded legacy `pins.json` (same seed as v4's second test) gets its uniqueIds filled in.
- Storybook: add a `Pinned` story to `TableListItem.stories.jsx`.

## Verification
- `npm run test:unit` (the preferences defaults), `npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`.
- `npm run dev:react` with a temp copy of `tests/data/m22/career/CAREER-M22TEST`. Back up `%APPDATA%/<app>/pins.json` and `preferences.json` first.
  - With no `pins.json`, the Pinned section shows the label, then Player 4220, League 4269, Franchise 4688, Team 7388, then the divider. The same four tables are also decorated in the full list. `pins.json` gets written with uniqueIds filled in.
  - Pin a table from the action bar. It appears in the Pinned section at once, in id order, and its card in the full list is decorated. The link reads "Unpin". Unpin it from the action bar, pin it again, remove it with the trash button in the full list, pin it again, and remove it from the Pinned section.
  - Filter: only matching pins show in the section, and the section disappears when none match. The trash button never selects the row.
  - Toggle the Pinned section off. Close the file, reopen it (and another file), and restart the app: it stays hidden, and `preferences.json` has `tableEditor.showPinnedTables: false`. Cards stay decorated while it's hidden. Toggle it back on.
  - Run `npm run dev` (v4) on the same file: the bookmark bar shows the same pins, and the settings window still opens and saves without dropping `tableEditor`. Pin something in v4 and check that React shows it.
- `npm run e2eTest:react` (the new pins spec), then `npm run e2eTest` (v4 regression). The only shared changes are the new preferences section and the two default builders.
- Review the diff against this plan.

## Decisions (from review, 2026-10-24)
- A pinned table appears both in the Pinned section and in its normal place. Both cards are decorated and both can unpin.
- The Pinned section has a "Pinned" label and a divider.
- Showing or hiding the section is a global preference (`tableEditor.showPinnedTables`) that persists across files and restarts.
- Unresolved pins are hidden in React and kept in `pins.json`. No objection was raised. Revisit if they should show as disabled rows.
- The Pinned section scrolls with the list and is not sticky. This was my choice; change it if you want it fixed at the top.
