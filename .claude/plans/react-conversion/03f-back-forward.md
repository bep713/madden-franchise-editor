# 03f — Back / forward navigation

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Only reads data. Touches `TableEditor.tsx`, `FieldEditorView.tsx`, `TableSidebar.tsx` and the tab state from 03t.

## Goal
Port v4's back button (`TableEditorView.navSteps`, `.back-link`) and add a forward button, behaving like a web browser's:
- Click Back / Forward moves one step.
- Click-and-hold (or right-click) opens a menu of the history in that direction. Picking an entry jumps straight to it.
- History is per tab.
- The buttons sit in the sidebar header, left of the search box, with new icons in the style of the existing ones.

## v4 behaviour (what is being ported)
- `navSteps: {tableId, recordIndex, column}[]`, per view, saved per tab as `tab.tabHistory` (`navigationService.js:543`, `:576`).
- A step is pushed after every table load (`TableEditorView.js:528-536`) and on a jump-to-column Go (`:328`).
- A followed reference first rewrites the last step to the clicked cell (`ReferenceRenderer.js:33-39`), so Back returns to that cell.
- Back (`TableEditorView.js:384-401`) pops the current step and loads the one before it with its cell selected. "< Back" is disabled while there are fewer than 2 steps.
- No forward, no menu.
- Not ported: v4 rewrites the last step to the *target* record 125 ms after a same-table reference click (`ReferenceRenderer.js:59-63`), which loses the cell you came from. Here a same-table reference pushes a step instead (see "Same-table moves").

## Design

### History model (`src/renderer/src/tabs/tabHistory.ts`, new, pure)
```ts
export interface HistoryEntry {
    tableId: number;
    selection: CellPosition;     // (record, field)
    scroll?: ScrollPosition;
}
export interface TabHistory {
    entries: HistoryEntry[];
    index: number;               // the current entry
}
export const MAX_HISTORY = 50;

export function startHistory(entry: HistoryEntry): TabHistory
// Records where the user was on the current entry (`from`), drops every
// forward entry, appends `entry`, and trims the oldest past MAX_HISTORY.
export function pushEntry(h: TabHistory, entry: HistoryEntry, from?: Pick<HistoryEntry, 'selection' | 'scroll'>): TabHistory
// Records `from` on the current entry and moves to `index` (clamped). Same object if index is unchanged.
export function goTo(h: TabHistory, index: number, from?: Pick<HistoryEntry, 'selection' | 'scroll'>): TabHistory
export function canGoBack(h: TabHistory | undefined): boolean
export function canGoForward(h: TabHistory | undefined): boolean
// For the menus, nearest first, each with its index in `entries` (Chrome's order)
export function backEntries(h): { index: number; entry: HistoryEntry }[]
export function forwardEntries(h): { index: number; entry: HistoryEntry }[]
```
- "Where the user was" is written into the entry being left at the moment of leaving, as a browser saves the scroll position of the page you leave. So Back returns to the exact cell (and scroll) you left, which covers v4's "rewrite the last step to the clicked cell" without a special case.
- `pushEntry` with the same table and selection as the current entry is a no-op (a double click on the same reference).

### Tab state (`src/renderer/src/tabs/editorTabs.ts`, `EditorTabsContext.tsx`)
- `TableTab` gets `history?: TabHistory`. It lives in the reducer, not in the `viewStates` ref, because the buttons' enabled state and the menus must re-render. It only changes on navigation, which already re-renders the tab bar through `tableChanged`.
- New `TabAction`s, both no-ops for a non-table or unknown key:
  - `{ type: 'historyPush'; key; entry; from? }` — `startHistory` when the tab has none, else `pushEntry`.
  - `{ type: 'historyGo'; key; index; from? }` — `goTo`.
- Both skip navigation in `apply`, like `tableChanged` (extend the `action.type !== 'tableChanged'` check to a small set).
- Context: `historyPush(key, entry, from?)`, `historyGo(key, index, from?): HistoryEntry | undefined` (returns the entry moved to, read from the reduced state, so the caller can load it in the same tick). `activeTab` already carries `history`.
- New tabs (`+`, ctrl/middle-click on a sidebar table or a reference) start with no history, as a browser's new tab does. v4's new-tab path doesn't hand the opener's steps over either (`table-editor:new-tab` → `onNewTabButtonClicked` → fresh tab).
- A new file resets the tabs (`syncFile`), so history goes with them.

### Loading (`src/renderer/src/routes/TableEditor/TableEditor.tsx`)
- `LoadOptions` gets `history?: 'push' | 'none'` (default `'push'`).
- `onSelectTable`:
  - At the start, read `from = getViewState(tabKey)` (`selection`, `scroll`). This must happen before the load, because the successful load overwrites the view state.
  - On success with `'push'`: `historyPush(tabKey, { tableId, selection: selection ?? {row:0,col:0}, scroll }, from)`, next to the existing `tableChanged`. On a superseded or failed load, nothing is pushed.
- Callers:
  - Sidebar click and a followed reference in the current tab: `'push'` (default).
  - The tab-activation effect: `'none'` when the tab already has history. A tab's first load (no history yet) pushes, which creates its first entry.
  - Import reload (`useTableDataCommands`' `reloadTable`): `'none'`.
  - Back / Forward / menu: `'none'` (below).
- `goToHistory(index)` (new):
  1. `from = getViewState(tabKey)`; `entry = historyGo(tabKey, index, from)`. The index moves at once, so two quick Back clicks go back two steps, as in a browser. Loads already drop superseded results (`loadIdRef`).
  2. If `entry.tableId` is the shown table: select the cell through the grid handle (no reload, no loader), and `setViewState` the selection.
  3. Else `onSelectTable(table, entry.selection, { force: true, scroll: entry.scroll, history: 'none' })`.
- Orientation isn't stored per entry. A history move to another table opens it in the normal view, as every other table load does.

### Same-table moves (`FieldEditorView.tsx`)
- New prop `onNavigateInTable: (to: CellPosition) => void`, stable like the other callbacks. `TableEditor` implements it as `historyPush(tabKey, { tableId: shown, selection: to, scroll: undefined }, getViewState(tabKey))`.
- Called by:
  - `jumpToCell` (jump-to-column Go), as v4 pushes there.
  - `handleFollowReference`'s same-table, current-mode branch, which today only calls `selectCell`.
- `FieldEditorView` takes an optional `gridRef?: React.RefObject<GridHandle>` from `TableEditor` and uses it instead of its own `useRef`, so `goToHistory` can call `selectCell` for a same-table step (React 18, so it is a normal prop, not `ref`).

### Where the reference was clicked (`TableEditorComponent.tsx`)
- `onFollowReference` gets a 4th argument `from: CellPosition | null`: the clicked cell, from the `cell` already computed in `handleClick` (null in `handleAuxClick`, which only opens new tabs).
- `FieldEditorView` / `TableEditor.onFollowReference` pass it as the `from` of the push, instead of relying on the view state having caught the selection before the click. Falls back to the view state when null.

### Buttons and menu (`src/renderer/src/routes/TableEditor/components/HistoryButtons/`, new)
`HistoryButtons.tsx`:
```ts
interface Props {
    history?: TabHistory;
    tableNames: ReadonlyMap<number, string>;
    onGo: (index: number) => void;
}
```
- Two buttons, `aria-label="Back"` / `"Forward"`, `title` the same plus "(Alt+Left)" / "(Alt+Right)", disabled from `canGoBack` / `canGoForward`. Same box as `.pinToggle` (28 × 28, transparent border, `--platinum` hover); disabled at 0.35 opacity like `.pinToggleOff`, no hover.
- Pointer handling per button (logic in a small hook `useHoldToOpen(onClick, onOpenMenu)`, same folder):
  - Primary `pointerdown` starts a `HOLD_MS = 500` timer. If it fires, the menu opens and the following `click` is swallowed. A `pointerup` before then is an ordinary click → `onGo(index ∓ 1)`.
  - Releasing the pointer over a menu item after a hold picks that item (Chrome's press-drag-release), using `document.elementFromPoint` → `closest('[data-history-index]')`.
  - `contextmenu` (right-click) opens the menu straight away, as in Chrome.
  - The timer is cleared on `pointercancel` and unmount.
- `HistoryMenu.tsx`: a popover below the button, placed with `utils/popover.ts`' `placePopover`, portalled to `body`, with a transparent underlay that closes it on click. Same surface as `ReferenceEditor`'s `.popover` (white, `--timberwolf` border, shadow), `role="menu"`, `max-height` with scroll.
  - Rows (`role="menuitem"`, `data-history-index`, `data-table-id`): the table id in `labelSmall` emphasis over the name, the same two lines as the sidebar card (`TableListItem`) but compact (no card padding/height). An unnamed table shows only the id (`isUnnamed`). Entries for the same table (a jump-to-column step) show the same title, as a browser shows the same page title twice.
  - Back menu lists `backEntries` (nearest first), Forward menu `forwardEntries`.
  - ArrowUp/ArrowDown move focus, Enter picks, Esc closes; the first item is focused on open.
- Shortcuts while the table editor is shown and no modal is open (same guard as Ctrl+J in `FieldEditorView`, including the `.handsontableInput` check): Alt+Left / Alt+Right, and the mouse's back/forward buttons (`mouseup` with `button` 3 / 4, `preventDefault`). Registered in `TableEditor`, not in `HistoryButtons`.

### Sidebar (`TableSidebar.tsx`, `TableSidebar.module.scss`, `TableEditor.tsx`)
- `TableSidebar` gets `headerStart?: React.ReactNode`, rendered first in `.header`. `TableEditor` passes `<HistoryButtons …/>`. This keeps the sidebar unaware of history.
- Header becomes `[Back][Forward][search…][pin toggle]`. At the current 200 px minimum the search box would be ~90 px wide, so raise the sidebar pane's `minSize` to 240 (Welcome's pane uses 235).

### Icons (`src/renderer/src/assets/icons/back.svg`, `forward.svg`, new)
- Hand-written like `close.svg` / `unpin.svg`: `viewBox="0 0 10 10"`, `fill="currentColor"`, a left / right arrow (shaft plus open chevron, ~0.8 stroke weight to match `jump.svg` / `switchOrientation.svg`). Imported with `?react`, shown at 14 × 14 like the pushpin.

### Cleanup
- `react/tabs.spec.js:149`: replace the `TODO(04+ back button)` comment with the per-tab history check (below).
- `03-table-editor-parity.md`: link this plan from row 03f, update its text (forward button, menu, new tabs start empty), status.

## Edge cases
- Back while a load is in flight: the index has already moved; the newer load wins (`loadIdRef`).
- A history entry's table fails to load: the index stays moved, the editor shows nothing selected (as a failed sidebar click does today). Back/Forward still work.
- Clicking the already-shown table in the sidebar: no load, no push (existing early return).
- Closing a tab drops its history with the tab. Switching tabs never pushes.
- Expression (SPEX) tables are history entries like any other. Their `selection` is just `{0,0}`; `goToHistory` doesn't call `selectCell` when the shown view isn't a field editor (gridRef is null).
- Filter text in the search box is left as is on a history move.
- More than `MAX_HISTORY` entries: the oldest is dropped and `index` shifts down by one.

## Tests

### Vitest
- `tabs/tabHistory.test.ts`: start, push from the middle drops forward entries, `from` written to the left entry, no-op duplicate push, trim at MAX_HISTORY, `goTo` clamps and returns the same object when unchanged, back/forward entry order.
- `tabs/editorTabs.test.ts`: `historyPush` creates and extends a table tab's history; both actions ignore main tabs and unknown keys; a new tab / `openTableTab` has no history; `syncFile` for a new file drops it.
- `HistoryButtons.test.tsx` (fake timers): disabled states; click calls `onGo(index-1)` / `onGo(index+1)`; hold opens the menu and swallows the click; right-click opens it; menu lists entries nearest first with id and name (unnamed → id only); picking an item calls `onGo` with its index; Esc and the underlay close it.

### E2E
- New `tests/e2e/scripts/react/back-button.spec.js`, port of v4 `back-button.spec.js` (React starts on 4096, so the expected first table is "4096" where v4 has "4097 - OverallPercentage"; open 4097 first if the reference cells the v4 test relies on are there), plus:
  - Forward returns to where Back came from, including the selected cell.
  - A sidebar click after going back drops Forward (Forward disabled).
  - Hold Back opens the menu with the expected `<id>`/name rows; picking the oldest goes back several tables in one step, and Forward then lists the skipped ones.
  - Right-click Back opens the same menu.
  - Jump to column pushes a step: Back returns to the previous cell in the same table.
  - Alt+Left goes back.
- `react/tabs.spec.js`: at the TODO, check that each tab keeps its own history (Back in one tab doesn't follow the other's path, and a new tab's Back is disabled).
- Page model `tests/e2e/models/react/TableEditorPage.js`: `clickBack()`, `clickForward()`, `isBackEnabled()`, `isForwardEnabled()`, `openBackMenu({ rightClick })` (hold = `mouse.down`, wait past `HOLD_MS`, wait for `role=menu`), `historyMenuItems()` (texts), `pickHistoryItem(text)`. Locators by `aria-label` and `role`, not class names.

## Verification
`npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`, `npm run e2eTest:react`. Also run the v4 `back-button.spec.js` to confirm it is untouched.

## Decisions (approved 2026-10-30)
1. New tabs start with empty history (browser), not a copy of the opener's. This replaces the index's earlier "a tab opened from a reference starts with the opener's history".
2. Jump to column and same-table reference clicks push entries (v4 pushes on jump; browsers push for in-page anchors). v4's overwrite of the step you came from on a same-table reference click is not ported.
3. Extras beyond the original request are in scope: right-click opens the menu, press-drag-release picks an item, Alt+Left/Right and the mouse's back/forward buttons.
4. Sidebar `minSize` 200 → 240.
5. Out of scope: ctrl/middle-click on Back/Forward to open that entry in a new tab (Chrome does this).
