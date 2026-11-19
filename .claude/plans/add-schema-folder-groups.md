# Add Schema: folder groups, file search, sticky Add bar

## Goal
On the Add Schema page (`src/renderer/src/routes/AddSchema/`):
1. Files that share a folder collapse into one line with an **Expand** link. Expanded, the
   files show indented inside that line item, in a scroll box with a capped height, and the
   link reads **Collapse**.
2. A search box above the file list filters it by file name.
3. The footer (problems, summary, **Add schema**) stays pinned to the bottom of the window.
4. A **Remove all** button clears the file list. **Remove** on a folder line removes every
   file in that folder.

## Removing
- Model: `removePath(files, path)` becomes `removePaths(files, paths: string[])`, with one
  key Set so a folder of thousands is a single pass. Callers and tests are updated.
- Hook: `removeFile(path)` becomes `removeFiles(paths: string[])`, so one change makes one
  inspect, not one per file. Card props: `onRemove(paths: string[])`.
- Folder line: a `Remove` button (`data-action='remove-folder'`, aria-label
  `Remove all files in <folder>`) removes **all** of the folder's files, including ones the
  search hides, because the line stands for the whole folder. Its expanded state is dropped.
- **Remove all**: a link-style button (`data-action='remove-all'`) on the search row, right
  aligned, shown while there are rows. It calls `onRemove(all paths)` and clears the query
  and the expanded set. There's no confirm, because choosing the files again is cheap and
  nothing is written. An empty request falls back to the existing "no files" state.

## Files
- `components/SchemaFilesCard.tsx` / `.module.css`: grouping, search, nested list.
- `addSchemaModel.ts` (+ test): pure helpers `groupByFolder` and `filterRows`.
- `AddSchema.tsx` / `AddSchema.module.scss`: footer moves out of the scrolling `<main>`.
- `components/SchemaFilesCard.test.tsx`: update the big-folder test, add tests for groups and search.
- `tests/e2e/models/react/AddSchemaPage.js`, `tests/e2e/scripts/react/add-schema.spec.js`.

## Model (addSchemaModel.ts)
- `interface FolderGroup { folder: string; rows: FileRow[] }`. `FileRow` moves here from
  SchemaFilesCard, which re-exports it so imports don't change.
- `groupByFolder(rows: FileRow[]): FolderGroup[]`: groups on `pathKey(dirname(path))`
  (case and separator insensitive, like the rest of the page). Groups keep the order of
  their first row, and rows keep request order inside a group. One Map pass, because a
  folder can hold thousands of files.
- **Entry first**: `groupByFolder` pulls the rows with `role === 'entry'` out before
  grouping, usually one but several under several-entrypoints, and returns each first as a
  1-row group. The entry is therefore always the top line and
  never hidden inside a collapsed folder. The rest of its folder still groups, and if only
  one file is left there, it shows as a plain row. With no entry yet (unplanned or `.gz`), the order is the request order. A search that doesn't
  match the entry hides it like any other row.
- `filterRows(rows, query)`: trims the query and matches the file name case-insensitively
  as a substring. An empty query returns `rows`.

## SchemaFilesCard
- State: `query` (string), `expanded: Set<string>` keyed by the folder key.
- Search: `Textbox` with the search icon, as in `TableSidebar`. Placeholder "Search files...",
  `aria-label='Search files'`, `data-field='file-search'`. It shows only when there are rows.
  When nothing matches: "No files match “q”." (`data-testid='no-matches'`).
- Pipeline: `filterRows` → `groupByFolder` → `useShowMore(groups, VISIBLE_FILES, 'files')`.
  The existing 10-item cap now counts top-level items (groups and single files).
- A group with 1 row renders exactly like today's row (no change in markup).
- A group with 2 or more rows renders `<li data-folder={folder} data-count={n} data-planned>`:
  - Line: the folder path (ellipsis, `title`), then "13 files" (or "3 of 13 files" while a
    filter hides some), then a role summary only if a child has problems, shown as a
    "2 problems" badge colored by worst severity, so a collapsed blocker is still visible.
    Then the `Expand` / `Collapse` link button (`data-action='toggle-folder'`,
    `aria-expanded`, `aria-controls`). `data-planned` is "true" once every child has a role.
  - Expanded: a nested `<ul aria-label={`Files in ${folder}`}>` indented with
    `padding-left: var(--spacing-5)`, `max-height: 320px`, `overflow-y: auto`. The children
    use the existing row markup (`li[data-name]`, Remove, row problems), pulled into a
    `FileRowItem` component.
  - Collapsed is the default. Collapse hides all the children again.
- Groups stay collapsed while you search. Their count shows "N of M", so you can expand
  one to see the matches.

## Sticky footer
- `.page` is already `height: 100%`, a flex column. The footer `<div>` moves out of
  `<main>` to become `.page`'s last child, and `<main>` keeps `overflow: auto`, so only
  the content scrolls. The footer gets the horizontal padding, a white-smoke background
  and a top border, with `flex-shrink: 0`. The long ProblemList gets `max-height: 40vh;
  overflow-y: auto` so a big problem list can't push the content area to zero.

## e2e model and spec
- `waitForPlan`: counts `li[data-name], li[data-folder]` as rows, and as unplanned it counts
  `li[data-name]:not([data-role])` plus `li[data-folder][data-planned="false"]`.
- New helpers: `folder(dir)` locator, `toggleFolder(dir)`, `expandFolders()` (clicks every
  collapsed toggle), `search(text)`, `folders()` → `[{ folder, count }]`.
- Specs that inspect rows from one folder (`generates…`, `asks before…`, `malformed XML…`,
  `choosing a folder…`, the `@slow` one if it reads rows) call `expandFolders()` after the
  plan arrives.
- Rework "long file and still-needed lists": with 13 files in one folder, expect one group
  with `data-count=13`. Expand it and see 13 rows, and the nested list has a capped height
  with `scrollHeight > clientHeight`. Collapse it and see 0 rows. Search "Inc0" and the group
  reads "9 of 13 files". Still-needed and layout checks stay, with the group expanded.
- Big-folder test: MAIN.FTX is the first top-level line, outside the group, which then
  counts 12. Remove on the group leaves only MAIN.FTX. Remove all empties the list and
  brings back the "Add an entry FTX…" summary. The `choosing a folder…` test checks that
  the entry comes first.
- New check in the same test: the Add button's bottom is within the window after
  `main` is scrolled (sticky footer).

## Unit tests
- Model: grouping is case and separator insensitive, keeps order, and makes single-file
  groups. `filterRows` covers an empty query, case, and trimming.
- Model: the entry comes first even when it is the last request path and shares a folder,
  and `removePaths` is case insensitive.
- Card: the folder Remove calls `onRemove` with every path in the folder, including ones the
  search hides. Remove all calls it with every path and clears the search.
- Card: a folder of 25 shows 1 line, Expand shows 25 indented rows and the button says
  Collapse, and Collapse hides them. Files from 2 folders plus one lone file give 2 group
  lines and 1 plain row. Search filters rows and shows the "N of M" count and the
  no-matches line. A child's problem shows on the collapsed line. The 10-item cap now
  counts groups (12 single-file folders → "Show 2 more").

## Verification
`npm run typecheck`, `npm run lint`, `npm run stylelint`, `npm run test:react`,
`npm run build:react`, `npx playwright test tests/e2e/scripts/react/add-schema.spec.js --project=react`.
Then use verify-mfe to take a screenshot of the page with a big folder.
