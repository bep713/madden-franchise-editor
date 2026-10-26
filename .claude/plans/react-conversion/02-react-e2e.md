# 02 — React e2e tests

Roadmap: [plan.md](plan.md). Previous: [01-franchise-model.md](01-franchise-model.md). Next: [03-table-editor-parity.md](03-table-editor-parity.md).

## Goal
- Run Playwright e2e against the React UI (`MFE_UI=react`, built `out/renderer`), next to the v4 suite.
- Port the v4 specs, or the parts of them, that the React UI can already do. Leave everything else for the step that adds the feature.
- From here on, every React feature adds or extends a test (rule in `CLAUDE.md`, see "Testing rule" below).

The v4 specs in `tests/e2e/scripts/*.spec.js` stay **unchanged**. Shared helpers in `tests/e2e/util/` may only gain additive options that keep the v4 behaviour the same.

## What the React UI can do today
- Welcome: "Open a file..." (`electronAPI.showOpenDialog` → `franchiseAPI.openFile`), Recent Files list (click to reopen, which closes the previous file first), game save cards (scanned from Documents, not deterministic, so not tested), "Open the table editor".
- Navigation tabs: Home, "Open Table..." (`/table-editor`), "+" (also `/table-editor`). No tab model, no close.
- Table editor: sidebar list with fuzzy search, click to select. The first table loads on mount. Header text is `"<tableId> - <name>"`. Read-only Handsontable 16 grid (reference cells show raw binary, not v4's `"Spline - 0"`). Switch orientation. Export to xlsx/csv through `electronAPI.externalData.export`.
- Not in React yet: editing, save, close from the menu (React subscribes to no main → renderer events), pins, jump to column, references, reference editor, back button, import, raw/FRT export, empty records, schedule editor, schema prompts.

## v4 spec → React port

| v4 spec | Port | What is ported / why not |
|---|---|---|
| `smoke.spec.js` | **Partial** → `react/smoke.spec.js` | Open file, open table editor, first table loads, grid shows the file's data, open another table (7482), `LongName` row 52 = "New York", reopen the file from Recent Files. Not ported: jump-to-column modal (03d), edit + save, close from menu, follow reference and the reference editor (all 03a). |
| `tabs.spec.js` | **Partial** → folded into `react/smoke.spec.js` | Only "Home tab goes to the welcome page" and "the table editor tab opens the table editor again". The rest needs a tab model, which React doesn't have. "Remembers the last table" is not asserted, because React resets to the first table today and that isn't parity. |
| `export.spec.js` | **Partial** → `react/export.spec.js` | xlsx export of 4097 and 4220, compared with the same fixtures. Raw table and FRT export have no React UI (03c). |
| `pins.spec.js` | No | Ported by 03b (added to its plan). |
| `back-button.spec.js` | No | No back button / history yet. |
| `bulk-edit.spec.js`, `empty-records.spec.js` | No | Needs cell editing (03a). The "set as empty" context menu is a 04+ item. |
| `import.spec.js`, `import-roundtrip.spec.js` | No | Needs import (03c) and cell editing (03a). |
| `releaseNotes.spec.js`, `updateChannel.spec.js` | No | They test the v4 settings window, which React also opens unchanged. Running them again under React adds nothing. |

If a ported assertion fails because React really differs from v4 (for example the xlsx export of reference columns), keep the v4 fixture, mark that assertion `test.fixme` with a comment naming the step that fixes it, and note it in that step's plan. Don't change fixtures to match React.

## Files

### Harness
- `playwright.config.js`: add `projects`:
  - `{ name: "v4", testIgnore: "**/react/**" }`
  - `{ name: "react", testMatch: "**/react/**/*.spec.js" }`

  `npx playwright test` still runs everything. `--project=react` runs only React.
- `package.json`:
  - `e2eTest`: add `npm run build:react` before `npx playwright test`, since the full run now includes React.
  - New `e2eTest:react`: `npm run build:react && npx playwright test --project=react`.
  - CI (`.github/actions/build-and-test`) already runs `build:react` before Playwright, so it needs no change.
- `tests/e2e/util/Electron.js` (additive): `launchWithDefaultOptions({ ui: "react" })`.
  - Sets `MFE_UI=react` in the launch env.
  - Throws `"out/renderer/index.html missing, run npm run build:react"` if the build output is missing, so a stale or missing build fails clearly instead of timing out in `getMainWindow`.
  - For every launch, removes `MFE_RENDERER_URL` from the env, and `MFE_UI` too unless `ui === "react"`. That way a dev shell with those variables set can't flip the v4 suite.
- `tests/e2e/util/dialogStubs.js` (new): `stubOpenDialog(electronApp, filePath)` and `stubSaveDialog(electronApp, filePath)`.
  - Both use `electronApp.evaluate(({ dialog }, p) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] }) }, filePath)`. The save stub returns `{ canceled: false, filePath: p }`.
  - This works because `main.js:697–704` calls `dialog.showSaveDialog` / `showOpenDialog` on the module object at call time.
  - No app or test-only renderer code is needed. React has no `TestUtility` equivalent, and shouldn't get one.
- `tests/e2e/util/FileCompare.js` (new): `waitForFile`, `xlsxCompare` and `fileCompare`, copied from `export.spec.js` (which keeps its own copies, since it stays unchanged). Use chai `expect`, same as the v4 specs.
- The `failureArtifacts` fixture in `util/test.js` works as is: the React window URL also contains `index.html`.

### Page models (`tests/e2e/models/react/`)
Selector rules:
- CSS module class names are hashed in `vite build`, so never select on them.
- Use any of these, whichever is clearest for the element:
  - Roles, accessible names and text (`getByRole`, `getByText`, `getByPlaceholder`). Add an `aria-*` attribute when it also helps accessibility, for example `aria-current` on the selected item.
  - `data-*` attributes that carry the element's identity, like the existing `data-name` on `NavigationTab`. Name them after the data, not the test: `data-table-id`, `data-action`. They are allowed in production markup.
  - `data-testid`, through Playwright's `getByTestId`, when there is no natural identity to expose.
- Handsontable's own global classes (`.ht_master`, `td.current`) are fine to use.

Models:
- Reuse `models/App.js` unchanged. `getMainWindow`, `readTable` and `findTableIdByName` only use `franchiseAPI`, so they work under React.
- `WelcomePage.js`:
  - `waitForPageLoad()`: the "Madden Franchise Editor" headline is visible.
  - `openFranchiseFile(electronApp, path)`: `stubOpenDialog`, click the link "Open a file..." or "Open a different file...", then wait until the Get Started card title is the file's basename.
  - `openTableEditor()`: click "Open the table editor".
  - `recentFile(name)`: a locator for the Recent Files entry.
- `NavigationBar.js`:
  - `openTab(text)`: click `a[data-name="<text>"]`. `NavigationTab` already renders `data-name`.
  - `tabNames()`: the text of every tab.
- `TableEditorPage.js`:
  - `waitForTableToLoad()`: the loader (`role="status"`, see below) is hidden and the header is visible.
  - `getSelectedTableName()`: the header text `"<id> - <name>"`, same format as v4's `getSelectedTableName`, so assertions read the same.
  - `openTableById(id)`: fill the "Search tables..." box with the id, click `[data-table-id="<id>"]` in the sidebar, then wait for the table to load.
  - `selectedSidebarTable()`: the sidebar button with `aria-current="true"`.
  - `exportTable(electronApp, path)`: `stubSaveDialog`, then click `[data-action="EXPORT"]`.
  - `grid`: a `Grid` instance.
- `Grid.js`: a Handsontable 16 version of v4's `HotComponent`.
  - `selectCellAt(row, col)`: click the first body cell, then use the arrow keys, as v4 does. Handsontable scrolls virtualized columns into view.
  - `selectCell(row, columnName)`: gets the column index from the grid's header row, scrolling right if the header isn't rendered yet. If that's flaky, use the headers from `App.readTable` instead.
  - `getTextAtSelectedCell()`: reads `td.current` in `.ht_master`.

  Check HOT 16's class names when implementing (for example, the corner clone is `ht_clone_top_inline_start_corner`, not `ht_clone_top_left_corner`).

### App changes (selectors)
- `components/TableListItem/TableListItem.tsx`: add `data-table-id={table.id}` and `aria-current={table.selected ? 'true' : undefined}` on the root.
- `TableActionBar.tsx`: pass `data-action={TableActions[item.key]}` (the enum name, for example `EXPORT`) through to each `Link`. If `Link` doesn't forward unknown props yet, add a typed `dataAttributes` / rest-props passthrough.
- `components/Loader/Loader.tsx`: add `role="status"` and `aria-live="polite"` on the wrapper, plus `aria-label="Loading"` when there's no message.
- Update any vitest snapshots these change (`npm run test:react -- -u`, then review the diff).

### Specs (`tests/e2e/scripts/react/`)
Each spec starts like the v4 ones: `test` from `../../util/test`, `beforeAll` / `afterAll` → `TestUtil.overwriteTestCareer`, and `electron.launchWithDefaultOptions({ ui: "react" })`.

`smoke.spec.js`, test "basic test (react)":
1. The welcome page loads. Open `FilePaths.m22.career.test`. The card title is `CAREER-E2ETEST`. The tabs include "Home" and "Open Table...".
2. Open the table editor. `getSelectedTableName()` is `"4097 - OverallPercentage"`, and the selected sidebar entry is 4097.
3. The grid shows the file's data. The text at (0, 0) equals `App.readTable(4097)`'s first record, first column, read through IPC. Comparing against IPC data instead of a hard-coded string keeps the test valid when 03a changes how references are displayed.
4. `openTableById(7482)` → `"7482 - Team"`. `grid.selectCell(52, "LongName")` → `"New York"`.
5. Home tab → the welcome page loads, and Recent Files lists `CAREER-E2ETEST`. The "Open Table..." tab → the table editor loads (header visible).
6. Home tab → click the recent file → the card title is `CAREER-E2ETEST` again, and `franchiseAPI.getActiveFileId()` is a new id. Open the table editor → 4097 loads.
7. `electronApp.close()`.

`export.spec.js`, test "export table e2e test (react)":
- Same `beforeAll` as v4 (create the export output dir, then reset the career file).
- Export 4097 to `FilePaths.m22.exports.test`, `waitForFile`, then `xlsxCompare` with `exports.overallPercentage`.
- `openTableById(4220)`, export, then `xlsxCompare` with `exports.player`.
- No auto-open-Excel setting is needed: React's export never opens Excel.

## Testing rule (CLAUDE.md)
**Decision: e2e for each user-visible flow, vitest for logic, not component tests only.**
- React reuses v4's preload and IPC shapes, so the biggest risk is a mismatch between what React expects and what main returns. Component tests with a mocked `window.franchiseAPI` can't catch that. One e2e flow per feature does, and it also checks persisted results (the saved file, `pins.json`, preferences).
- e2e is slow (an app launch per test), so it covers the happy path, not every branch. Branching logic goes in vitest: pure utils, hooks, and components with several states. 03a and 03b already follow this split.
- Rule text: added to `CLAUDE.md` under "v5 React UI". Each step plan's Verification lists the specs it adds or extends.

## Roadmap updates
- `plan.md`: insert step 02 (this plan). Table editor parity becomes 03 (`03-table-editor-parity.md`, items 03a–03e), and the remaining items become 04+. Remove the "React e2e harness" bullet from that list.
- `03b-table-pins.md` (then 03a): Phase 7 gains `react/pins.spec.js`, a port of v4's `pins.spec.js` adapted to the sidebar UI and seeded through `launchWithDefaultOptions({ ui: "react", pins })`. It checks the default pins, pin/unpin from the action bar, the result in `pins.json`, and uniqueId migration from a seeded legacy file.

## Verification
- `npm run build:react && npx playwright test --project=react`: green locally. Run it again with `E2E_SCALE=1 E2E_WINDOW_SIZE=1024x728` (CI's window size). The sidebar is virtualized, so `openTableById` must search first and never scroll.
- `npm run e2eTest`: the full suite (v4 + React) is green. v4 is unaffected.
- `git diff --stat -- tests/e2e/scripts/*.spec.js tests/e2e/models/*.js` is empty, so the v4 specs and models are untouched.
- `npm run typecheck`, `npm run lint`, `npm run test:react` (snapshot changes reviewed).
- Push a branch and check that the CI `build-and-test` job runs both projects.
- Review the diff against this plan.

## Implementation notes
- React loaded `tables[0]` (4096, unnamed) on mount, but v4 starts on the second table (`TableEditorView.js`, `tableChoices[1]`). `TableEditor.tsx` now does the same (`tables[1] ?? tables[0]`). This is a parity fix, not a test change.
- Handsontable 16 renders its own `role="status"` announcer, so `Loader` also sets `aria-busy="true"` and the model selects `[role="status"][aria-busy="true"]`.
- `Card` takes an optional `data-testid`. It's used for `get-started-card` and `recent-files`, because the side nav has its own "Open a file..." link and the file name appears in both cards.
- `data-action` is set in `FieldEditorActionBar` / `ExpressionEditorActionBar` (each has its own `TableActions` enum). `Link` already forwards extra props.
- `Grid.selectCell(row, column, columnNames)` takes the headers from `App.readTable` (the plan's fallback), since the grid's header row is virtualized.
- Models wait with `locator.waitFor()` / `util/poll.js`: `@playwright/test` 1.25's `expect` can't drive `playwright` 1.59 locators.
