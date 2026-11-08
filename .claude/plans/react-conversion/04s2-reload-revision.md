# 04s2: Same-file reload signal (`revision`)

Index: [04s-schema-management.md](04s-schema-management.md). React context and tab state only. Independent of 04s1. 04s3's schema load uses it; a future FTC change or external-modification reload should too.

## Context
`franchise:load-schema` reopens the file with the same `fileId`, so everything that keys off `fileId` (tabs, the table editor, pins, view states) would keep showing tables from the old schema. This step adds a counter that changes on a same-`fileId` reopen.

## Changes
- `OpenFranchiseFile` (`context/FranchiseFileContext.tsx`) gets `revision: number`. `buildOpenFranchiseFile` takes an optional `revision`, default 0. A fresh open (Welcome, restore after a renderer reload) is 0. Callers that reopen the same `fileId` pass `openFile.revision + 1` (04s3's `handleLoad` is the first). FTC change and external-modification reloads should increment it too, which isn't in scope here.
- `editorTabs.ts`: `TabsFile` and `EditorTabsState` get `revision`. `syncFile` rebuilds when `fileId` **or** `revision` differs. On a rebuild with the same `fileId`, keep `activeKey` if it's still a main tab, so the user stays on Schemas. Table tabs are dropped, as v4's `generateMainNavigationTabs` does after a schema load. A new `fileId` resets to Home as it does today.
- Effects that currently assume "tables change only with fileId" switch to `[fileId, revision]`:
  - `TableEditor.tsx:456` (reload the table).
  - `usePinnedTables.ts:74` (re-run `preparePins` against the new tables; update its comment).
  - `EditorTabsContext.tsx:110` (clear view states).
  - `useMenuState.ts:49` doesn't depend on the table list, so it stays on `fileId`.
- `EditorTabsContext`: `selectTab(key, file?)` takes the just-opened file, like `openTableEditor`, so a caller can select a main tab in the same tick as `setOpenFile` (04s3 uses it for `general.defaultEditor = 'open-schema-viewer'`).

## Verification
- **Vitest**:
  - `editorTabs.test.ts`: a revision bump with the same `fileId` keeps a non-Home main tab active and drops table tabs. A revision bump while a table tab is active falls back to Home. A new `fileId` still resets to Home. The same `fileId` and revision is a no-op.
  - `usePinnedTables` (extend its test): a revision bump re-runs `preparePins` with the new tables.
  - `EditorTabsContext.test.tsx`: `selectTab(key, file)` selects the tab for a file that isn't in state yet; a revision bump clears view states.
- Run `npm run typecheck && npm run lint && npm run test:react`, then `npm run e2eTest:react` (no behavior change for existing flows, since nothing bumps `revision` yet).
