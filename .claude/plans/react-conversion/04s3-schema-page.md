# 04s3: Schema management page

Index: [04s-schema-management.md](04s-schema-management.md). Builds on [04s1-schema-ipc.md](04s1-schema-ipc.md) (list/delete/`hasUnsavedChanges` APIs) and [04s2-reload-revision.md](04s2-reload-revision.md) (`revision`, `selectTab(key, file)`).

## Facts this relies on
- `schemaPicker.pick` puts the custom dir first, so on an exact version tie the APPDATA copy already wins when a file opens. On an exact tie it returns the first match in scan order (the custom dir's subfolders, then its root files).
- v4's match rule (`schemaViewerService.manageSchemaVersionInfo`, `schemaMismatchHandler`): major and minor are equal, and the game year is too if `expected.gameYear` is set.
- `franchise:load-schema` only replaces the entry on `ready`, so a failed load keeps the old one.

## Changes

### Pure logic: `src/renderer/src/routes/SchemaManagement/schemaList.ts`
- `schemaLabel(entry, entries)`: `M25 v219.2` (`C` for college), `v220.0` for untyped entries, with ` (Custom)` added to a custom entry that has a bundled twin (same type, year, major, minor).
  - Duplicates: when two or more entries share a base label (`schemas/M22_329_1.gz` and `schemas/old/M22_329_1.gz`, `.gz` + `.xml`, `M22_329_1 - Copy.gz`, since the regex isn't anchored), each of them gets its file name: the path relative to the schema dir for custom entries, the base name for bundled ones. Example: `M22 v329.1 (Custom, old/M22_329_1.gz)`. Unique labels stay short.
  - Rows use `path` as the React key everywhere, never the label.
- `groupSchemas(entries, games)`: returns `{ groups: {game, schemas}[], other: SchemaEntry[] }`. Groups only for `games.json` entries with `isSupported` that have at least one schema. Every entry that doesn't land in a group goes into `other`: untyped entries, and typed ones for unsupported or unknown games (`M18_…`, `M28_…`). Nothing is dropped, because `schemaPicker.pick` still reads those files. Typed entries in Other keep their full label (`M18 v95.1`). Groups are sorted by year descending (as on Welcome), then Madden before College. Inside a group: version descending, then custom before bundled, then the original `getSavedSchemas` order (a stable sort). That last rule mirrors `schemaPicker.pick`'s tie order, so the first custom row of a version is the one auto-pick would use.
- `samePath(a, b)`: compares paths case-insensitively and ignores the slash direction (Windows).
- `isLoaded(entry, metadata)`: `samePath(entry.path, metadata.schemaList?.path)`. Loaded is matched by path, not version, because twins share a version.
- `matchesExpected(meta, expected)`: v4's rule.
- `findExpectedSchema(entries, metadata)`: entries of the file's game type (missing type means `'madden'`, as in `findGame`) that match `expectedSchemaVersion`. Untyped entries also qualify on major/minor, as `schemaPicker` treats them as matching any year. Preference order: typed custom, typed bundled, untyped (which can only be custom). Ties within a tier keep the `getSavedSchemas` order, same as the group sort. Returns null if there's no expected version or no entry matches.
- `loadedLabel(metadata, entries)` / `expectedLabel(metadata)`: the matching entry's label, or one built from the meta and the file's type. The expected label drops the year when `expected.gameYear` is unset (v4 shows "ANY"). Returns `None` / `Unknown` when the meta is missing.

### Tab
- `data/navigation.ts`: the Schemas item gets `implemented: true` and `alwaysShow: true`.

### Page: `src/renderer/src/routes/SchemaManagement/`
- `App.tsx`: route `schema-management` → `<SchemaManagement />`.
- `useSchemaList.ts`: `{ entries, refresh }`. Loads on mount; `refresh` calls `franchiseAPI.getSavedSchemas()` (which rejects on error), and an error shows a message box.
- `SchemaManagement.tsx`: same shell as Welcome's `main` (headline, padded scroll area, container queries), without the side nav.
  - Shared grid: move Welcome's `.filesByGame` column rules (3 columns; 4 at `main` ≥ 1450px, 2 at ≤ 950px, 1 at ≤ 650px; `gap: var(--spacing-4)`) into `components/GameGrid/GameGrid.module.css` (`.grid`). Welcome's `.filesByGame` and both rows of this page use it, so the top row's columns line up exactly with the cards below. The container queries stay on the `main` container that both pages' `<main>` declare. Welcome's look must not change.
  - Top row: one `Sticky placement='top'` wrapping the whole row, so the action bar and the loaded card stick together. The wrapper gets the same backdrop as GetStartedCard's `.card` (`white-smoke` background, 20px top/bottom padding, `margin-bottom: -20px`) so cards scroll under it, and `z-index: 1`. Inside it, a `GameGrid` with `align-items: stretch`, so both items are the same height:
    - With `LoadedSchemaCard` (a file is open): the action bar takes `grid-column: 1 / -2` and shrinks to the columns left over. The card takes `grid-column: -2 / -1`, exactly one column, the same width as a schema card below it.
    - Without it (no file): the action bar takes `grid-column: 1 / -1`, the full width as before.
    - In the 1-column layout (≤ 650px), `1 / -2` collapses to a single cell, so the two stack, with the action bar on top. The whole row still sticks there. That's accepted, since the action bar is short.
    - `SchemaActionBar` doesn't render its own `Sticky` (unlike GetStartedCard). The page owns stickiness.
  - Below: a `GameGrid` of `SchemaCard`s, then the "Other schemas" card if `other` is non-empty.
  - `handleLoad(entry)`: first `franchiseAPI.hasUnsavedChanges(fileId)`. If it's true, show a warning `showMessageBox` ("Load schema <label>?", detail "The file is reopened from disk. Unsaved changes will be lost.", buttons `Load` / `Cancel`, cancel is the default) and stop on Cancel. If the check itself fails, prompt anyway. Then run `useLoader` with the message "Loading schema...", call `franchiseAPI.loadSchema(fileId, entry.path, false)`, then `getTableList`, then `setOpenFile(buildOpenFranchiseFile(fileId, metadata, tables, openFile.path, openFile.revision + 1))`. On `{error}`, show the message box "Could not load schema <label>." with the error as detail.
  - `handleDelete(entry)`: a warning `showMessageBox` ("Delete schema <label>?", detail: the full file path; buttons `Delete` / `Cancel`, cancel is the default), then `schema.delete`, then `refresh()`. An error shows a message box.
- `components/SchemaCard.tsx`: a `Card` with a `GameIcon` and the title `<shortTitle> Schemas` (the Other card has no icon). A vertical `List`, one row per schema:
  - The name is a `Link` when a file is open and the schema isn't loaded. Otherwise it's `Text`, in bold when loaded.
  - The trash button shows when `source === 'custom'` and the schema isn't loaded: `<button aria-label="Delete <label>" data-action="delete-schema">` with a new `trash.svg`.
  - Rows carry `data-name={label}`, and the loaded row also gets `data-loaded`.
- `components/LoadedSchemaCard.tsx` (`data-testid='loaded-schema'`): the header shows a status icon on the left, then the title "Loaded schema". A green `check.svg` (new) when `matchesExpected(loaded, expected)`, otherwise a red `close.svg`. The icon has `data-status='match'|'mismatch'` and an aria-label.
  - Row "Loaded:" shows `loadedLabel`.
  - Row "Expected:" shows `expectedLabel`. It's a `Link` (`data-action='load-expected'`) to `handleLoad(findExpectedSchema(...))` when an expected entry exists and isn't the loaded one.
- `components/SchemaActionBar.tsx`: a horizontal `List` of links like GetStartedCard.
  - Open schema directory: `schema.initialize()` → `files.openFolder(dir)`.
  - Refresh schema list: `refresh()`.
  - Add schema and Scan for schemas render disabled. Add a `disabled` prop to `Link`: no onClick, `aria-disabled`, muted color.

### Welcome
- `Welcome.tsx`: `OPEN_SCHEMA_MANAGEMENT` → `editorTabs.selectTab('schema-management')`. A `defaultEditor` of `'open-schema-viewer'` → `selectTab('schema-management', file)`. This replaces the TODO for the schema part.
- `Welcome/SideNav.tsx`: add `onClick` per item (the `SideNav` base already spreads extra props). Wire `schemaManagement` only; the rest stay as they are.

## Edge cases
- No file open: no LoadedSchemaCard, every name is plain text, and the trash still works.
- An embedded schema or one loaded from outside both dirs: no row is marked loaded, and the Loaded label comes from the meta.
- A compressed FTC with `expectedSchemaVersion` null: Expected shows "Unknown", the icon is red, and there's no link.
- Clicks during a load: the loader overlay blocks them.
- Any listed schema can be loaded into any file, including other years, other game types and untyped ones, as in v4 (a deliberate decision). A load that fails with an error leaves the old entry in place.
- A known issue, left for the Add-schema plan: `_saveSchema` always names files `M<year>_…`, so a college schema added through v4 lands in the Madden card.

## Verification
- **Vitest**:
  - `schemaList.test.ts`: labels and `(Custom)`, duplicate labels getting their file name added (subfolder, extension, " - Copy") while unique ones don't, the stable tie order (subfolder entry before root entry), grouping/sorting/Other, typed entries for unsupported or unknown games (M18) landing in Other with their full label, `matchesExpected` (with and without `gameYear`), `findExpectedSchema` preferring custom, respecting game type, and falling back to an untyped match (returned only when no typed one exists).
  - `SchemaManagement.test.tsx`: link vs text vs bold, trash visibility, the Loaded card's states, a load calling `loadSchema` and updating the context (revision bumped, tab stays on Schemas), a load with unsaved changes prompting first (Cancel skips `loadSchema`, Load proceeds), a clean load not prompting, and delete confirm/cancel.
  - `Welcome.test.tsx`: the side nav and GetStarted link select the tab.
  - Update the no-file tab expectations from `['Home']` to `['Home', 'Schemas']` in `usePinnedTables` and `EditorTabsContext.test.tsx`.
- **E2E**: new `tests/e2e/scripts/react/schema-management.spec.js` and `models/react/SchemaManagementPage.js`. Add `stubMessageBox(electronApp, response)` to `util/dialogStubs.js`.
  1. With no file: the Schemas tab shows, the page lists the bundled cards, there's no Loaded card, and names are plain text.
  2. Copy the bundled `M22_329_1.gz` into `<userDataDir>/schemas`, open the M22 test career, and go to Schemas. "M22 v329.1 (Custom)" is listed with a trash icon. Load it: the Loaded row shows the Custom label and `getMetadata().schemaList.path` is in userData. Load the bundled entry, then delete the custom one (stub confirm = 0). The row is gone and the file is removed from disk.
  2b. With auto-save off, edit a cell in the table editor, go to Schemas, and load a schema: the confirm box shows (stub = Cancel), and the schema path is unchanged. Then stub Load: the schema loads and the edit is gone from `getMetadata()`/the reloaded record.
  3. The Loaded card's status matches `getMetadata()` (match vs mismatch), and the Expected link (when present) loads it.
  4. Layout (with a file open, default e2e window size): the loaded card's bounding box has the same `x` and `width` (±1px) as the last column's schema card in the first grid row, and the action bar's right edge is left of the card. Without a file, the action bar's width equals the grid's width. Scroll `<main>` to the bottom: the action bar's and the loaded card's `top` are unchanged.
  - Welcome's existing specs still pass after the `GameGrid` extraction (no layout change).
  - Update `tabs.spec.js:50` (no file → `["Home", "Schemas"]`).
- Run `npm run typecheck && npm run lint && npm run test:react && npm run test:unit`, then `npm run e2eTest:react`.
- Manual: `npm run start:react`. Check the page without a file, then with an M-file and with the C27 file. Confirm the tab stays on Schemas after a load. Resize across 1450 / 950 / 650px. The loaded card stays one column wide and lines up with the column below it; below 650px it stacks under the action bar. Scroll to check the whole row sticks with no gap above it. Check that Welcome looks unchanged.
