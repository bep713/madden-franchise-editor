# 03t — Navigation tabs

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Roadmap: [plan.md](plan.md). Done before 03c.

Status: implemented 2026-10-27 (uncommitted). Deviations: `goHome` is `selectTab("home")`; no `placeholderRemoved` flag (the placeholder missing from `tabs` is the same thing); `getNavigationItems` lives in `data/navigation.ts`; tab titles and `TableHeader` share `utils/tableTitle.ts`.

## Context
React's tab bar (`routes/Layout/Layout.tsx`, `components/Navigation/`) is static. It lists the nav items plus a "+" that is a `<Link to="/table-editor">`. No tab is ever active, nothing is closable, the "Open Table..." tab is never replaced, and there are no per-table tabs. `data/navigation.ts` has drifted from `data/navigation.json` (no 27, no `availableTypes`, Schedule and Schemas commented out, an Abilities item that v4 hides).

v4 keeps its tabs in `renderer/js/services/navigationService.js` (`tabs`, `generateMainNavigationTabs` 139, `addTab` 177, `closeTabAndSelectNextAvailableIfNeeded` 207, `generateNavigation` 267, `onNewTabButtonClicked` 345, `onNewTabClicked` 358, `onTableEditorClicked` 398, `saveTableEditorTabState` 537, `switchTableEditorTab` 550, the `open-file` handler 727-832, resize handling 846). Tab classes: `renderer/js/services/tabs/Tab.js`, `TableEditorTab.js`. The v4 spec is `tests/e2e/scripts/tabs.spec.js`.

The user preference `general.defaultEditor` (`data/preferencesSchema.json:16-27`, default `"open-home"`, options `open-home | open-schedule | open-table-editor | open-schema-viewer`) opens an editor straight after a file loads (`navigationService.js:814-824`). React doesn't read it (`Welcome.tsx` `initializeFile` ends at `send('file-loaded')`). **This plan adds it.**

Outcome:
- No file open: the tab bar shows only **Home**.
- File open: Home, Schedule (Madden franchise files only), Schemas, **Open Table...**, then "+". Schedule and Schemas are stubs: shown, but clicking them does nothing.
- Clicking "Open Table..." (or "+", or the Welcome "Open the table editor" link) replaces it with a table tab that loads the first table. The tab is titled `<tableId> - <name>`, the same as v4.
- Table tabs: several can be open, each remembers its table, selected cell and scroll position. They can be closed with the × button or a middle-click.
- With `general.defaultEditor = "open-table-editor"`, opening a file goes straight to the table editor and "Open Table..." is never rendered.

## v4 behaviour to match
Tab set:
- `generateMainNavigationTabs` builds the main tabs from `navigation.json` items whose `availableVersions` has the file's `gameYear`, `availableFormats` has its `format`, and `availableTypes` (if set) has `metadata.type.gameType`. Order is the order in the file: Home, Schedule, Schemas, "Open Table...". Then the "+" button (`add-tab-button`). Main tabs aren't closable.
- It is rebuilt (all table tabs dropped) on every file open. Close File goes Home.
- v4 only draws the tab bar on editor pages (`table-editor.html`, `schedule.html`, `schema-viewer.html`); `welcome.html` has none. **React differs on purpose:** the bar is in `Layout` on every page, and shows only Home before a file is open (the user asked for this).

Table tabs (`TableEditorTab`: `tableId = -1`, `tableRow`, `tableColumn`, `tabHistory`, `scrollPosition`; closable):
- `addTab` inserts before "+" with the name "New Tab". When its table loads, `table-changed` renames the **active** tab to `` `${tableId} - ${name}` `` and stores `tableId`. Any table change in that tab (sidebar, reference link) renames it again.
- `onTableEditorClicked` ("Open Table...", the Welcome link, the default-editor preference):
  1. If "Open Table..." exists: remove it, and add an active "New Tab" unless a "New Tab" already exists.
  2. Otherwise, if the active tab isn't a table tab: activate the **first** table tab if there is one, else add an active "New Tab".
  3. Load the editor for the active tab.
- "+" (`onNewTabButtonClicked`): deactivate the current tab, add an active "New Tab", load it. A new tab has no table yet, so it opens the first table. If "Open Table..." still exists, the result is the same as clicking it (the placeholder is removed and the new tab is reused).
- Once removed, "Open Table..." doesn't come back for that file, even after every table tab is closed. Then the only ways in are "+" and the Welcome link.
- Clicking a tab that isn't active saves the previous table tab's state (`saveTableEditorTabState`: last selected row and column, nav history, scroll position), activates the clicked tab and runs its action. Clicking the active tab does nothing.
- Switching between table tabs reuses the loaded editor (`switchTableEditorTab`). The table is re-read and the saved selection and scroll are restored.
- Close (× button, or middle-click with `mousedown` default prevented so there is no autoscroll): remove the tab. If it was active, activate the tab to its left and run its action. Closing a tab that isn't active leaves the active one alone.

Tab bar DOM (`generateNavigation`):
- Each tab: `.tab`, `data-name=<name>`, `.active` on the active one, `.closable` plus a `.close-tab-button` on table tabs. The close button is visible on hover and on the active tab (React's SCSS already has this).
- Mouse wheel on the bar scrolls it sideways (`scrollLeft += deltaY`).
- After each render, scroll the active tab into view (`inline: "start"`). If the tab to its right is "+", scroll that into view instead, so "+" stays visible.
- On window resize: briefly show the scrollbar (`show-scrollbar` for 400 ms). Growing scrolls the tab right of the active one into view (`inline: "end"`); shrinking scrolls the active tab into view.

Default editor:
- After a successful open, if `general.defaultEditor` is set and isn't `"open-home"`, emit it as a welcome event. `open-table-editor` runs `onTableEditorClicked`, so the placeholder is created and removed in the same tick and never drawn.

## Approach

### 1. Navigation data (`data/navigation.ts`, `src/shared/types/navigation.ts`)
- Mirror `navigation.json`: add 27 everywhere. Uncomment Schedule (`availableFormats: [FRANCHISE]`, `availableTypes: ['madden']`) and Schemas. Remove Abilities (v4 hides it). Add `CopyUniqueId` to the menu lists. Keep `alwaysShow` on Home.
- Add `availableTypes?: string[]` to `NavigationItem`. Add an `implemented?: boolean` flag (true for Home and table-editor). Clicking a tab without it does nothing. 04+ sets it as each page lands.
- Move the item filter out of `Layout.tsx` into a pure `getNavigationItems(metadata)` that also checks `availableTypes` against `metadata.type?.gameType`.

### 2. Tab state (`src/renderer/src/tabs/`)
- `editorTabs.ts`: a pure reducer with no React imports. State: `{ fileId, tabs, activeKey, placeholderRemoved }`. A tab is either `{ kind: 'main', key: item.id, item }` or `{ kind: 'table', key, name, tableId }` (key from a counter, never reused). Actions:
  - `openTableEditor`, `newTab`, `selectTab(key)`, `closeTab(key)`, `tableChanged(key, tableId, name)`, `goHome`.
  - Each rule above becomes one case. `closeTab` returns the tab that became active, so the caller can run its action.
  - Every action carries the current `fileId` and `metadata`. If `fileId` differs from `state.fileId`, the reducer starts from the fresh tab set for that file (`[...mainTabs, placeholder]`, Home active) before applying the action. This makes "reset on open" independent of effect ordering. The default-editor call in `initializeFile` runs in the same tick as `setOpenFile` and still sees a fresh set. No file means only Home.
  - The active tab defaults to Home whenever state is (re)built.
- Tab title: `tableTabTitle(tableId, name)`. It returns `` `${tableId} - ${name}` ``, or just `tableId` for unnamed tables. Move `isUnnamed` out of `TableHeader.tsx` into a shared util, and use it in both places. (v4 never auto-opens an unnamed table, so it has no rule for this. React opens 4096 first, see Decisions.)
- `EditorTabsContext` + `useEditorTabs()`, provided by `Layout` (it stays mounted across child routes, and is inside the router, so it can `navigate`). It exposes `tabs`, `activeTab`, and commands that dispatch and then navigate. Home → `/`, a table tab → `/table-editor`, a non-implemented main tab → no-op (nothing dispatched).
- Per-tab view state (`{ selection: CellPosition, scroll: { top, left } }`) lives in a `useRef<Map<key, ...>>` in the provider, not in reducer state, so selecting cells doesn't re-render the tab bar. The editor writes to it as the selection and scroll change. It's dropped with the tab, and the whole map is dropped on reset. This replaces v4's explicit `saveTableEditorTabState` call on every switch, because the ref is always current. That includes leaving to Home, which unmounts the editor.
- Back-button history per tab (`tabHistory`) is **not** in this step, because React has no back button yet (roadmap 04+, reference navigation). That plan adds `history` to the per-tab view state.

### 3. Tab bar (`components/Navigation/`)
- `Navigation` takes `tabs`, `activeKey`, `onSelect`, `onClose`, `onNewTab`, `showNewTabButton`. It renders "+" itself (move the `addTabButton` styles from `Layout.module.scss`).
- `NavigationTab`: replace `<Link>` with an element that doesn't navigate on its own (`role="tab"`, `aria-selected`, `data-name`). Keep the global `active` / `closable` classes and the existing aux-click / middle-mousedown handling. Give the close button `aria-label="Close tab"`. Wrap the tabs in `role="tablist"`.
- Wheel → `scrollLeft += deltaY` with `preventDefault` (a non-passive listener via ref, since React's `onWheel` is passive). Scroll-into-view of the active tab / "+" in a layout effect on `activeKey` and tab count. The resize handler (`show-scrollbar` flash, grow/shrink rule) lives in a `useEffect` (`styles.showScrollbar`).

### 4. Table editor (`routes/TableEditor/TableEditor.tsx`)
- Read `activeTab` from `useEditorTabs()`. Replace the `firstTable` effect with an effect on `activeTab.key`:
  - If the tab has a `tableId` that exists in the file, load it with the saved selection and scroll.
  - Otherwise load the first table at (0, 0).
  - `TableEditor` stays mounted across table-tab switches (no `key` on it), so the sidebar filter and pinned toggle stay, the same as v4's reused editor. The table is re-read every time.
- After every successful `onSelectTable` (sidebar, reference link, tab activation), dispatch `tableChanged(activeKey, table.id, table.name)`.
- `TableEditorComponent` / `FieldEditorView`: add `onSelectionChange(CellPosition)` (from `afterSelectionEnd`) and `onScroll({top,left})`, plus an `initialScroll` prop applied after `initialSelection`. All three are wired to the per-tab ref. Use stable callbacks, so the grid isn't re-rendered. (`initialSelection` already exists at `TableEditorComponent.tsx:328`.)
- The `onSelectTable` guard `table.id === selectedTable?.id` must not skip a tab switch to a tab showing the same table. Pass a `force` flag from the tab effect.
- Expression (SPEX) tables keep the tab rename, but have no selection or scroll to restore.

### 5. Welcome and file lifecycle
- `Welcome.tsx`: "Open the table editor" calls `tabs.openTableEditor()` instead of `navigate('/table-editor')`. "Schema management" stays a no-op until its page exists. Remove the `navigate('/schema-management')`, which currently falls through to `*` → Welcome.
- `initializeFile`: after `setOpenFile` and `send('file-loaded')`, read `general.defaultEditor` with `window.electronAPI.preferences.getValue`. For `open-table-editor`, call `tabs.openTableEditor(newFileId)`, passing the new id because context hasn't re-rendered yet.
  - `open-schedule` / `open-schema-viewer` do nothing for now and stay Home (stubs). Add a TODO naming the 04+ item.
  - A preference read that throws counts as `open-home`.
- Close File (`useFileMenuCommands`): it already navigates `/` and clears the file. The reducer's fileId rule then gives Home only, so nothing new is needed. Check this in vitest.
- Renderer reload restore (`useActiveFranchiseFile`): you get a fresh tab set (Home active, "Open Table..." shown). The default editor isn't re-applied, the same as v4, where a reload also starts on Home.

### 6. Closing into a stub
v4 activates the tab to the left and runs its action. The tab left of the first table tab is always a main tab (Schemas, or Schedule/Home), and right now that is a stub. Rule for now: walk left past non-`implemented` tabs (to Home at worst), activate that tab and navigate. Once Schemas is implemented this becomes v4's rule with no further change. Cover it in the reducer tests.

## Tests

vitest:
- `tabs/editorTabs.test.ts`, one case per rule:
  - Fresh set per format/year/type (Madden franchise: Home, Schedule, Schemas, Open Table...; common: no Schedule; CFB franchise: no Schedule; no file: Home).
  - Placeholder replacement, and "New Tab" reuse when "+" is clicked while the placeholder exists.
  - Placeholder never returns.
  - `openTableEditor` picks the first table tab when on Home.
  - `newTab` inserts before "+".
  - Close active → left neighbour, skipping stubs. Close inactive → active unchanged.
  - `tableChanged` renames only the given tab, and unnamed tables use the id only.
  - A fileId change resets.
- `Navigation.test.tsx`: the active tab has `aria-selected` and no click handler effect; × and middle-click call `onClose` once and don't select; a stub tab click does nothing; "+" is hidden without a file.
- `Welcome` / `initializeFile`: `defaultEditor = open-table-editor` calls `openTableEditor` with the new fileId; `open-home`, a rejected read and the stub values don't.

e2e — new `tests/e2e/scripts/react/tabs.spec.js`, a port of v4 `tabs.spec.js`:
- Before open: tab names are exactly `["Home"]`.
- After opening M22 career: `["Home", "Schedule", "Schemas", "Open Table..."]` plus "+". Clicking Schedule leaves the Welcome page showing and the tab names unchanged.
- Click "Open Table..." → table loads, the active tab is `4096` (React opens the first table, see Decisions), "Open Table..." is gone, 4 tabs.
- Close file, reopen, Welcome link → same result.
- Open 7482 from the sidebar → the active tab is `7482 - Team`.
- "+" → new active tab on the first table, 5 tabs. Close the active one → back to `7482 - Team`.
- Several tabs: select a cell, switch away and back → the same table, the same selected cell text (from `app.readTable`), scroll restored (check the selected cell is visible).
- Close an inactive tab → the active tab is unchanged.
- Home → Welcome. The Welcome link → the first table tab is active again.
- Close every table tab, then the Welcome link → a new tab on the first table, 4 tabs, no "Open Table...".
- v4's "each tab has its own history" block waits for the back-button item. Leave a `// TODO(04+ back button)` at that spot.
- Default editor: a second test launches with `preferences: { general: { defaultEditor: 'open-table-editor' } }`. Before opening the file, install a MutationObserver (`window.evaluate`) that sets a flag if any `[role="tab"][data-name="Open Table..."]` is ever added. Open the file → the table editor is shown with the active tab `4096`, and the flag is false.
- `models/react/NavigationBar.js`: locator `[role="tab"][data-name]`, plus `activeTabName()`, `openNewTab()`, `closeTab(name)` (hover, then the "Close tab" button), `closeActiveTab()`, `tabCount()` (excluding "+"), `hasTab(name)`.
- `react/smoke.spec.js`: update its tab assertions to the new set, and its `openTab` call if it uses one.
- The v4 `tabs.spec.js` stays unchanged.

## Verification
`npm run typecheck`, `npm run lint`, `npm run test:react`, `npm run build:react`, `npx playwright test --project=react`, plus the v4 `tabs.spec.js` to confirm nothing shared broke (`data/navigation.json` isn't touched).

## Decisions (to confirm in review)
- **First table.** React opens the file's first table (4096 in M22, shown as `4096`) since `c257f8a`. v4 skips it and opens 4097 (`4097 - OverallPercentage`). This plan keeps React's choice. Say so if v4's should win; it's a one-line change in the tab effect, and the expected tab names in the spec would change.
- **Unnamed table titles** use the id only, matching `TableHeader`. v4 would render `4096 - ` plus a NUL.
- **Tab bar on Home.** It shows on the Welcome page, unlike v4, as asked.
- **Closing into a stub** walks left to the nearest implemented tab (section 6).
- **Plan id** `03t`, so 03c–03e keep their numbers.
