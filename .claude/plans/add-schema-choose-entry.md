# Add schema: let the user choose the entry FTX

## Goal
Today main picks the entry itself (`buildTree` in `main/services/schemaImport/plan.js`:
the root that reaches the most files), and the page gives no way to change it or any hint
that it was guessed. The user can mark any FTX row as the entry, and go back to the
detected one. A chosen entry also resolves `several-entrypoints` and `no-entrypoint`.

## Request / types (`src/shared/types/addSchema.ts`)
- `AddSchemaRequest.entry?: string` — absolute path of the chosen entry. Absent = detect.
- `AddSchemaPlan.entryChosen: boolean` — true when the plan used `request.entry`.
  (A stale `entry` — file removed, or not an FTX in this set — is ignored, so the
  renderer can't infer this from the request alone.)

## Main
- `schemaImport/index.js` `parseRequest`: accept `entry` when `undefined` or an absolute
  string; copy it into the parsed request. Otherwise throw (same as files).
- `plan.js`:
  - `buildTree(ftxs, files, problems, entryPath)`: if `entryPath` matches (`samePath`) a
    node in `nodes` (the first file of its include-name group), use it as the root:
    `reach(root)`, skip the `no-entrypoint` / `several-entrypoints` checks. Unreached
    FTX files stay `unused`. Cycle and `no-database-name` handling unchanged. Return
    `{ entry, reached, missing, header, chosen }`.
  - `planAdd` passes `request.entry`, returns `entryChosen: !!tree?.chosen`.
  - `databaseName(scans, entryPath)` passes the entry through, so the saved meta's
    databaseName matches the chosen tree.
- `commit.js` `buildGenerated`: `databaseName(scans, plan.entry)`.

## Renderer
- `useAddSchema`: `setEntry(path: string | undefined)` → `change(r => ({...r, entry}))`
  (omit the key when undefined). `removeFiles` drops `entry` if it removes that path.
  `EMPTY_REQUEST` unchanged.
- `addSchemaModel.ts`: `canBeEntry(row)` = role `include` or `unused` (FTX rows only;
  `schema`/`invalid`/unplanned rows can't be).
- `SchemaFilesCard`: new props `entryChosen: boolean`, `onSetEntry(path | undefined)`.
  - Rows where `canBeEntry`: a "Make entry" link button (`data-action='set-entry'`,
    `aria-label="Make {name} the entry"`), before Remove.
  - The entry row, when `entryChosen`: keeps the "Entry" badge and gets a "Use detected"
    link (`data-action='reset-entry'`). When detected, the badge gets
    `title="Detected from the includes"`.
  - Drop-zone hint gains: "The entry is detected from the includes; use Make entry to
    pick another."
- `AddSchema.tsx`: pass `entryChosen={plan?.entryChosen ?? false}` and `onSetEntry`.
- `describeProblem.ts`: `several-entrypoints` → "…: {names}. Use Make entry on one, or
  remove the ones you don't need."; `no-entrypoint` → "…no entry file. Use Make entry on
  one."

## Edge cases
- Entry removed → hook clears `entry`; main also ignores a stale one.
- Remove all → files empty, `entry` cleared by the same rule.
- Choosing an include as entry: its parents become `unused`; their includes it doesn't
  reach become `unused` too; missing-includes recomputed from the new root.
- Duplicate include names: only `nodes` (first of each group) are eligible; the
  duplicate-name problem still blocks.
- gz / mixed kinds: `entry` ignored (no tree).

## Tests
- Unit `tests/unit/schemaImportPlan.test.js`: chosen entry resolves a tie (roles, entry,
  `entryChosen`, no several-entrypoints); choosing an include makes the old root unused
  and narrows `missing`; stale entry path ignored (`entryChosen: false`); a chosen entry
  breaks `no-entrypoint` in a cycle (cycle still reported). `databaseName(scans, entry)`.
- Unit `tests/unit/schemaImport.test.js` (if it covers parseRequest): bad `entry` throws.
- Vitest: `SchemaFilesCard.test.tsx` — Make entry shows on include/unused rows only and
  calls `onSetEntry(path)`; Use detected shows on a chosen entry and calls
  `onSetEntry(undefined)`. `useAddSchema.test.ts` — setEntry sends `entry` in the
  inspect request; removing that file drops it.
- e2e `tests/e2e/scripts/react/add-schema.spec.js`: gen tree + `standalone/STANDALONE.FTX`.
  MAIN detected as entry, STANDALONE unused → Make entry on STANDALONE → STANDALONE is
  entry, gen files unused, game madden-26 → Add → `M26_310_0.gz` saved, meta
  databaseName `Madden26_Franchise`, has `Player`, no `Team`. Also checks Use detected
  returns MAIN before choosing again. Page model: `setEntry(name)`, `resetEntry()`.

## Verification
`npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run test:react`,
`npm run build:react` + `npx playwright test tests/e2e/scripts/react/add-schema.spec.js`.
