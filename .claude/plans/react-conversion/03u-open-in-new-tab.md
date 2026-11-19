# 03u — Open a table in a new tab (ctrl+click / middle-click)

Index: [03-table-editor-parity.md](03-table-editor-parity.md). Builds on [03t-navigation-tabs.md](03t-navigation-tabs.md).

## Goal
Browser-style "open in new tab" for the React table editor:
- **Ctrl+click** (or Cmd+click) a table in the sidebar, or a reference link in the grid → open that table in a **new, active** tab.
- **Middle-click** either → open it in a **new background** tab. The current tab stays active and its grid isn't touched.
- A plain click is unchanged (it loads in the current tab).
- A reference opened in a new tab selects the referenced row (col 0), like a plain follow.

v4 only has a middle-click on reference links, which opens a new *active* tab (`ReferenceRenderer.js:66`, `TableEditorWrapper._openTableInNewTab` 422). React goes further on purpose (requested). The v4 spec is unchanged.

## Design

### Click → open mode (`src/renderer/src/utils/openMode.ts`, new)
```ts
export type OpenMode = 'current' | 'newTab' | 'background';
export function getOpenMode(e: { button: number; ctrlKey: boolean; metaKey: boolean }): OpenMode
```
- `button === 1` → `background` (ctrl+middle too, like Chrome).
- `ctrlKey || metaKey` → `newTab`.
- Else `current`.
Shared by the sidebar and the grid, so the rule lives in one place.

### Tab state (`tabs/editorTabs.ts`)
New action `{ type: 'openTableTab'; tableId: number; name: string; background: boolean }`:
- No file → unchanged state.
- Drops the placeholder (`withoutPlaceholder`), appends `{ kind: 'table', key: table-<nextId>, name: tableTitle(tableId, name), tableId }` at the end (same spot as "+", matching v4's `addTab`), bumps `nextId`.
- `activeKey` becomes the new key unless `background`.
- Appending at the end, not next to the current tab (Chrome's rule), keeps it the same as "+". Noted in Decisions.

### Context (`tabs/EditorTabsContext.tsx`)
- New command `openTableTab(tableId, name, options: { selection?: CellPosition; background?: boolean })`.
- `apply` returns the next state. The command dispatches, then seeds the new tab's view state with `{ selection }` (the new tab is the one whose key is `table-${prev.nextId}`). This must run after `apply`, because `apply` deletes view states of keys not in the tab set.
- No navigation change is needed: both modes stay on `/table-editor`.
- Activation reuses the existing path. `TableEditor`'s effect on `activeTab.key` finds the tab's `tableId` and loads it with the saved selection, so a foreground open loads through the same code as a tab switch, and a background tab loads when first clicked.

### Sidebar (`TableSidebar.tsx`)
- `onTableSelect?: (table, mode: OpenMode) => void`.
- The card button gets `onClick` (mode from the event), `onAuxClick` (only `button === 1` → `background`), and `onMouseDown` that `preventDefault`s a middle press (no autoscroll, same as `NavigationTab`).
- `TableListItem` is unchanged: it already spreads `componentProps`.

### Grid (`TableEditorComponent.tsx`, `FieldEditorView.tsx`)
- `onFollowReference?: (tableId, recordIndex, mode: OpenMode) => void`.
- `handleClick` passes `getOpenMode(event)` for `follow-reference`. The edit buttons ignore modifiers.
- Add `onAuxClick` on the wrapper: for a middle-click on `[data-action="follow-reference"]`, call `onFollowReference(..., 'background')`. Factor the target/coords lookup in `handleClick` into a helper so both handlers use it.
- Add `onMouseDownCapture` on the wrapper for a ctrl/meta/middle press on a follow-reference link only: `stopPropagation` (see Edge cases), and `preventDefault` for middle (no autoscroll). Other presses are untouched.
- `FieldEditorView.handleFollowReference`: the same-table shortcut (`selectCell`) only applies to `current`. Ctrl/middle on a self-reference opens a new tab, like a browser.

### Table editor (`routes/TableEditor/TableEditor.tsx`)
- `onSidebarSelect(table, mode)`: `current` → `onSelectTable(table)` (unchanged); otherwise `openTableTab(table.id, table.name, { background: mode === 'background' })`. The new tab gets no seeded selection, so it opens at (0, 0) through the existing default.
- `onFollowReference(tableId, recordIndex, mode)`: `current` → as today; otherwise `openTableTab(tableId, name, { selection: { row: recordIndex, col: 0 }, background })`.
- Both are stable callbacks (the existing `onSelectTableRef` pattern), so the grid isn't re-rendered.

## Edge cases
- Background open: the current tab's view state, grid, and loader are untouched, and no `readTableData` call is made until the new tab is activated.
- Ctrl+click in Handsontable adds the cell to a multi-selection and re-renders it, which replaces the link before `click` fires (found in e2e). So the wrapper's `onMouseDownCapture` stops a ctrl/meta/middle press on a follow-reference link before Handsontable sees it (and `preventDefault`s a middle press, so no autoscroll). This replaces the planned `onMouseDown`.
- The sidebar's selected-table highlight follows the active tab only; a background open doesn't change it.
- The reference link is an `<a>` with no `href`, so Electron has no native ctrl-click/middle-click navigation to suppress.
- SPEX tables: a ctrl/middle-click in the sidebar works the same (the tab loads whatever kind of table it is).

## Tests

vitest:
- `utils/openMode.test.ts`: plain, ctrl, meta, middle, ctrl+middle.
- `tabs/editorTabs.test.ts`: `openTableTab` foreground (appended, active, titled, tableId set), background (active unchanged), with no file (no-op), drops the placeholder, keys keep increasing.
- `tabs/EditorTabsContext.test.tsx`: `openTableTab` seeds the new tab's view state with the selection and leaves the current tab's alone.
- `TableSidebar.test.tsx`: plain / ctrl / middle (auxclick) call `onTableSelect` with `current` / `newTab` / `background`. A middle `mousedown` is default-prevented.

e2e (extend `tests/e2e/scripts/react/tabs.spec.js`, new test "open tables in new tabs (react)"):
- Ctrl+click 7482 in the sidebar → a new tab `7482 - Team` is active, header `7482 - Team`.
- Middle-click 4104 in the sidebar → a tab `4104 - Stadium` exists, the active tab and header are still `7482 - Team`.
- In 7482, ctrl+click the Stadium reference at row 43 → a new active tab `4104 - Stadium` with row 12 selected. The tab you came from still shows `7482 - Team` when you go back.
- Middle-click the same reference → a new tab, the active tab stays `7482 - Team`. Activating it shows `4104 - Stadium` with row 12 selected.
- Models: `TableEditorPage.sidebarCard(id).click({ modifiers: ['Control'] })` / `{ button: 'middle' }` through new `openTableById(id, { modifiers, button })`-style helpers (`ctrlClickSidebarTable`, `middleClickSidebarTable`, after the search), and `Grid.followReferenceAtSelectedCell(options)` passing click options through `_clickInSelectedCell`. `NavigationBar.tabNames()` / `activeTabName()` already exist (check; add if not).

## Verification
`npm run typecheck`, `npm run lint`, `npm run test:react`, `npm run build:react`, `npx playwright test --project=react tests/e2e/scripts/react/tabs.spec.js tests/e2e/scripts/react/reference-editor.spec.js`.

## Decisions (to confirm)
- New tabs are appended at the end of the bar (like "+" and v4), not inserted right after the current tab (Chrome).
- Ctrl+middle-click opens a background tab.
- A ctrl/middle-click on a reference to the current table opens a new tab instead of just selecting the row.
