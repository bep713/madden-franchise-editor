# Compact table editor spacing (v5)

## Goal

Add a v5 "Table editor spacing" preference (`default` | `compact`). Compact gives
v4-like cell metrics and tighter chrome around the grid, and replaces the table
sidebar with a virtualized table picker in the header, in the spot where the
table title is now. Default leaves the current UI unchanged.

The layout values are a starting point. We iterate on them with `verify-mfe`
screenshots compared against v4 at the same window size.

## Decisions (from the grilling session)

- One preference controls both the cell density and sidebar vs. picker.
- It's set in Settings and with an action-bar toggle. There's no View menu item
  and no keyboard shortcut.
- The picker reuses `buildSidebarRows`, so pins come first when
  `general.showPinnedTables` is on. There's no show-pinned toggle button and no
  per-row pin buttons.
- Open modes are the same as the sidebar: click/Enter opens in the current tab,
  Ctrl+click opens a new tab, middle-click opens a background tab.
- Switching spacing keeps the table, tab, selection and scroll position. The
  sidebar's search text is dropped.
- The shared `Autocomplete` is not modified.
- Row text uses `tableTitle(id, name)` ("4220 - Player"), the same as the
  header and v4's Selectr. The fuzzy search still matches index, name and id.

## Files

### Preference
- `data/preferencesSchema.json`: add to `general` after `theme`:
  `key: "tableEditorSpacing"`, `label: "Table editor spacing"`,
  `type: "dropdown"`, `defaultValue: "default"`, `ui: "v5"`, options
  `Default`/`default` and `Compact (like legacy v4)`/`compact`. Help text:
  "Compact uses tighter spacing and resembles the legacy table editor. It uses
  smaller cells and replaces the table list with a search box above the table."
  The `ui` filter already exists (`main/handlers/preferencesHandler.js:95`).
  Check whether the v4 settings window and `preferencesStore` defaults need
  anything for a new dropdown key. Check what `tests/unit` preference-store
  tests do with the schema, in case a fixture lists every key.
- New `src/renderer/src/hooks/useTableEditorSpacing.ts`: wraps
  `usePreference<'default' | 'compact'>('general.tableEditorSpacing', 'default')`
  and returns `{ compact: boolean, toggleSpacing(): void }`. An unknown stored
  value counts as `default`.

### Layout switch: `routes/TableEditor/TableEditor.tsx`
- Call `useTableEditorSpacing()` once here.
- Compact: render no `Allotment`/`TableSidebar`. Render only the content pane,
  with `data-spacing="compact"` on `.tableEditorWrapper`, which the CSS hooks
  onto.
- Default: same JSX as today.
- Pass a `tablePicker` node (or `null`) and `onToggleSpacing`/`compact` down to
  both views. The node is built here so the views don't need tables or pins:
  `HistoryButtons` + `<TablePicker …/>`, wired to the existing `onSidebarSelect`
  and `onGoHistory`.
- The picker keeps its own filter text and runs its own Fuse search. Extract
  the existing `filteredTables` logic into a pure `filterTables(tables, text)`
  in a new `routes/TableEditor/filterTables.ts`, so the sidebar and the picker
  share it. The sidebar `useMemo` calls it.

### Header slot: `components/TableHeader/TableHeader.tsx`
- Add an optional `title?: React.ReactNode` prop. When it's given, it replaces
  the static `tableTitle` text, so `data-testid="table-header-title"` is only
  rendered in default mode.
- Add an optional `compact?: boolean` prop that applies a `.compact` class
  (smaller padding, smaller column gap). The CSS goes in
  `TableHeader.module.css`.

### Views
- `views/FieldEditorView.tsx` and `views/ExpressionEditorView.tsx`: new props
  `tablePicker?: React.ReactNode`, `compact: boolean` and
  `onToggleSpacing: () => void`. Pass them to `TableHeader` (`title`,
  `compact`) and to the action bar.
- `TableEditorComponent` already serves both views. Pass it `compact`.

### Action bars
- `FieldEditorActionBar` and `ExpressionEditorActionBar`: add
  `TableActions.TOGGLE_SPACING` as the last item, with
  `data-action="TOGGLE_SPACING"`. The text is "Switch to compact spacing" when
  default and "Switch to default spacing" when compact. Use a new icon,
  `assets/icons/spacing.svg` (a simple rows/density glyph, `currentColor`, the
  same size as the others). The bars get a `compact` prop for the label. The
  views route the action to `onToggleSpacing`.

### New `routes/TableEditor/components/TablePicker/`
- `TablePicker.tsx` with these props:
  `rows: SidebarRow[] | undefined` (already filtered),
  `onFilter(text)`, `selectedTable: { id; name } | undefined`,
  `onTableSelect(table, mode: OpenMode)`.
- ARIA combobox: an `input role="combobox"` with `aria-expanded` and
  `aria-controls`, and a `role="listbox"` popup with `role="option"` rows that
  carry `data-table-id` and `aria-selected` for the highlight. The input has
  `aria-label="Table"` and `data-testid="table-picker"`.
- At rest the input value is `tableTitle(selected.id, selected.name)`.
- Focus: select all text and open with the current table highlighted, scrolled
  into view (`scrollToItem(index, 'center')`).
- Typing: set the filter (`onFilter`), highlight the first table row, and
  scroll to the top.
- ArrowUp/ArrowDown move the highlight and skip `pinnedLabel`/`divider` rows.
  Enter opens the highlighted table with `'current'`. Escape or blur closes,
  restores the title and clears the filter (`onFilter('')`).
- A click on a row calls `onTableSelect(table, getOpenMode(e))`. Middle-click
  goes through `onAuxClick` → `'background'`, with `onMouseDown` doing
  `preventDefault` for button 1 (and for button 0 too, so the input doesn't
  blur before the click). After a `'current'` pick: close, clear the filter and
  blur. After a new-tab pick: stay open.
- List: react-window `VariableSizeList` with a fixed popup height (about 400px,
  or less if there are fewer rows) and one-line rows (`TABLE_ROW_HEIGHT` about
  24, label about 20, divider about 9). Pinned rows show a small `Pushpin` icon.
  Reuse `rowKey` from TableSidebar: move it into `sidebarRows.ts` and export it
  there.
- Width: about 320px fixed (CSS var in the module, easy to tweak). Position the
  popup absolutely under the input, `z-index` above the grid.
- `TablePicker.module.scss`.
- `TablePicker.test.tsx` (vitest, jsdom). AutoSizer isn't used, because the
  list has a fixed size, which keeps jsdom simple. Tests:
  - shows the title at rest
  - focus opens with the current table highlighted
  - typing calls onFilter
  - the arrow keys skip non-table rows
  - Enter → `'current'`
  - Ctrl+click → `'tab'` (or whatever `getOpenMode` returns)
  - middle-click → `'background'`
  - Escape restores the title and clears the filter
  - pinned rows render first with the label and divider when the rows contain
    them

### Grid density: `components/TableEditorComponent/*`
- `TableEditorComponent.tsx`: new prop `compact?: boolean`. Add the
  `styles.compact` class to the wrapper when it's set.
- When `compact` changes on a mounted instance, re-apply the theme so
  Handsontable re-reads the CSS vars: `hot.useTheme(themeName)` then
  `hot.render()`, or `refreshDimensions()` if `useTheme` isn't enough. Then put
  back the scroll position the wrapper held before (row/col via
  `getViewState`-equivalent: read `holder.scrollTop/Left` before and restore it
  after). Selection survives a re-render. If re-theming doesn't change the row
  heights, fall back to a remount with `key` together with the existing
  `initialSelection`/`initialScroll` restore path. Prototyping decides which.
- `TableEditorComponent.module.css`: `.wrapper.compact :global(.ht-theme-main-dark-auto)`
  overrides `--ht-cell-horizontal-padding: 4px`,
  `--ht-cell-vertical-padding: 1px`, `--ht-font-size`/`--ht-line-height`
  for rows of about 23px (v4: 13px text, 23px rows), and the header row height
  to match.
- `TableEditor.module.scss`: `[data-spacing='compact'] .tableEditorComponentWrapper`
  padding drops from 10px to 2px or so.

### e2e
- `tests/e2e/models/react/TableEditorPage.js`: add the locators `picker`
  (`getByTestId('table-picker')`), `pickerOptions` (`[role="listbox"]
  [role="option"]`) and `spacingToggle` (`[data-action="TOGGLE_SPACING"]`).
  Add these methods:
  - `getPickerText()`
  - `pickTable(text, { modifiers })`: fill, then click the option or press
    Enter
  - `getPickerTableIds()`
  - `toggleSpacing()`
  - `isSidebarVisible()`: whether the search box is present
  Make `waitForTableToLoad` and `getSelectedTableName` work in both modes:
  wait for the header title or the picker, and read the picker value in
  compact.
- New `tests/e2e/scripts/react/compact-spacing.spec.js`. Seed the preference
  with `launchWithDefaultOptions({ ui: 'react', preferences: { general:
  { tableEditorSpacing: 'compact' } } })`. Tests:
  1. Compact layout: the sidebar is gone, the picker shows the first table's
     title, and focusing it lists the default pins first (`DEFAULT_PIN_IDS`
     order, as in pins.spec), then the rest.
  2. Typing "Player" and pressing Enter loads 4220 in the same tab, and Back is
     enabled.
  3. Ctrl+clicking an option opens a second tab with that table, and the first
     tab keeps its table.
  4. Toggle from default: the spacing toggle hides the sidebar, keeps the same
     table and selected cell, and `preferences.json` gets
     `general.tableEditorSpacing === 'compact'` (poll). Toggling back shows the
     sidebar again.
  5. Row height check: the compact first-row height is less than the default
     height (measured in one launch, across the toggle).
- Existing specs stay in default mode and must keep passing unchanged.

## Edge cases
- No tables or no selected table yet: the picker shows an empty input with the
  placeholder "Search tables...".
- `showPinnedTables` off: rows have no pinned section. That's already handled
  by `buildSidebarRows`.
- A pin toggled from the action bar while the picker is open: the rows update
  live, and `resetAfterIndex(0)` runs when rows change, as in the sidebar.
- A tab switch while the picker is focused: the title follows `selectedTable`
  unless the user is typing. Resync the displayed text whenever
  `selectedTable.id` changes and the input isn't focused.
- Expression (SPEX) tables: the picker is in that header too.
  `TablePagination` stays.
- Alt+Left/Right inside the picker input: `blocksHistoryKeys` doesn't block
  inputs other than HOT's, so history moves while the picker is focused. That's
  acceptable, and it matches the sidebar search box.
- Narrow windows (the CI size is 1024px): the header row wraps. The action bar
  is already `scrollable`.

## Verification
1. `npm run typecheck`, `npm run lint`, `npm run stylelint`,
   `npm run test:react`, `npm run test:unit`.
2. `npm run build:react`, then
   `npx playwright test --project=react tests/e2e/scripts/react/compact-spacing.spec.js`
   and the specs it touches indirectly: pins, tabs, back-button, cell-edit,
   jump-to-column, settings-window, smoke.
3. `verify-mfe`: screenshots of v5 default, v5 compact and v4 at 1280x800 and
   at the CI size, on M22 table Player. Show them to the user to iterate on the
   numbers.
4. Review the full diff against this plan.
