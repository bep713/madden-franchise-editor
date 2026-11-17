# 04a: Add schema (v5 only)

Index: [04-parity.md](04-parity.md). Builds on the Schemas page (04s) and its viewer (04v). Covers the "Add schema" half of 04a. "Scan for schemas" stays disabled and gets its own plan.

Design origin: an architect arena with two candidates, (A) one stateless page with a plan derived in main and (B) an Import modal plus a build draft held in main. A is the base. The grafts from B are marked "(from B)". Both flows were prototyped and compared with screenshots (2026-11-16). The user chose A's single page, plus B's facts summary for a ready `.gz`. An interrogation on 2026-11-16 found eight problems with probes against 4.4.1 and the tree. This revision fixes all eight (see "Interrogation fixes") and replaces the `_MMDDYY` naming with one name per identity (see "Naming", decision 9).

## Goal
From the v5 Schemas page, the user adds a schema to `<userData>/schemas` from either input:
1. a ready schema: one `.gz` (gzip JSON). Its meta is shown and can be changed before saving.
2. FTX input: one self-contained `.FTX`/`.xml`, or an entry FTX plus its include FTX files. Either way it goes through `generateSchemaV2` and is saved as `.gz`.

The user sets Game, Major and Minor. The fields are pre-filled from the files, and every pre-filled value says where it came from. There is also "Add default schemas" (checked). Problems the library would hide are shown before or during Add. After Add, opening a franchise file of that game and version uses the added schema, on every later open too.

Scope: v5 only. v4 is not a caller. `franchise:add-schema`, `_saveSchema`, `saveSchemaData`, `deleteSchema`, `getSavedSchemas` and the v4 schema-manager window are **not edited**, and neither is `_openError` or the pending-open flow (see "Games outside games.json"). The v4 e2e project must stay green.

## Decisions
- **One page, one flow**: route `#/schema-management/add`. The user never picks a mode. Main derives it from **file content**: gzip magic `1f 8b` + JSON with a `schemas` array means copy-gz. Any `FranTkData` FTX input means generate: a self-contained FTX is an entry with no includes (`fileMap = { main }`). The extension is ignored. Two kinds only: `copy-gz | generate`. Both save `.gz`.
- **Renderer state is the request, nothing more**: `{ files: string[], overrides: { game?, major?, minor? }, includeDefaults }`. Main answers every change with an `AddSchemaPlan`: kind, `facts` (copy-gz only), a row per file with its role, entry, missing includes, each option as `{value, detected, source}`, `target`, `problems[]` with closed codes, and `canAdd`. The renderer shows `override ?? plan.value` and never copies detected values into state.
- **Game identity is `{ gameType: 'madden' | 'college', gameYear: number }`**, not a games.json abbreviation, so a schema for a game missing from games.json (M18, M28, …) can be added (see "Games outside games.json"). The "Game" dropdown lists, in order: detected candidates, then every games.json entry (label `shortTitle`, so College is "CFB 27"), then any detected game that is not in games.json (label from `yearPrefix`, for example "M28"), then "Other game…". "Other game…" reveals a Madden/College toggle and a Year textbox. Overrides store the identity, never the label.
- **Detection order for each option** (one table in `plan.js`, `OPTION_SOURCES`, not branches):
  | Source (`PlannedOption.source`) | Game | Major / Minor | Applies to |
  | --- | --- | --- | --- |
  | `ftx-header` | `databaseName` (`CollegeFB27…` → college 27, `Madden27…` → madden 27) | `dataMajorVersion` / `dataMinorVersion` | generate |
  | `gz-meta` | `meta.gameType` + `meta.gameYear` | `meta.major` / `meta.minor` | copy-gz |
  | `file-name` | the picker's regex on the source name (`M27_620_0.gz` → madden 27) | the same regex | both |
  | `only-game-for-year` | the one games.json game with that year | n/a | both |
  | `open-file` | the open file's game for that year | the open file's expected version | both |
  | none | blocking `game-required` / `version-required` | | |

  For the FTX header, "first file with `databaseName`" means the library's depth-first pre-order: a file is checked before its own includes, and includes in document order. The entry's own `dataMajorVersion` is ignored when the entry has no `databaseName`. Pinned by a unit test against `generateSchemaV2` on the `order/` fixture.
- **Every gz is inspectable and every value can be overridden.** For copy-gz the files card shows the facts list (below) with what the file says, and the Options card shows what will be saved, each field with a "From file meta", "From file name" or "Guessed from <file>" hint and a "Use <detected>" link when overridden. This holds whether or not the gz has meta. When Game, Major or Minor comes from `open-file` for a gz, the plan adds the warning `version-guessed` ("This file doesn't say which version it is. The version was taken from <file>. Check it before adding."). The Add button stays enabled; the hint and the warning make the guess visible.
- **Result warnings have their own text.** A warning that comes back on the result is worded as done, not as advice: "The version was guessed from <file>." and "Generated without NESTED.FTX." The plan-time text ("Check it before adding") never reaches the success banner. `describeProblem(code, phase)` takes `'plan' | 'result'`.
- **Saved meta for copy-gz**: the bytes are copied unchanged only when the file's meta has `gameType`, `gameYear`, `major` and `minor`, and all four equal the chosen values. Otherwise main decompresses, sets `meta = { ...fileMeta, gameType, gameYear, major, minor }`, and recompresses. The plan says so ahead of time with the info `meta-written`, listing each field that changes ("Version: none → 620.0"). This also covers the bundled-style gz whose meta has no `gameType`.
- **Missing includes are a warning, not a block (decision 12).** The plan lists them under "Still needed" with the warning `missing-include`, and Add stays enabled. Clicking Add with missing includes opens one confirmation that names them ("Generate without NESTED.FTX? Tables in that file won't be in the schema."). There is no separate "Generate anyway" step. Confirming sends `acceptMissing: string[]`, the exact names the user saw. Main re-derives and refuses if the set changed (`missing-changed`). The saved result carries a `missing-includes-accepted` warning, shown in the success banner.
- **Include cycles block.** Any cycle reachable from the entry, including a file that includes itself, is blocking `include-cycle`, with the cycle's file names. `planAdd` finds it from the header scans, so `generateSchemaV2` (which recurses forever on a cycle in 4.4.1) never sees one. With several roots, a cycle that is not reachable from the chosen entry is reported on those `unused` rows only.
- **Folders (from B)**: Drop and "Choose folder" accept a folder. Main expands it, one level, to its `*.ftx`/`*.xml`/`*.gz` files. `plan.files[].path` is the expanded list, and the renderer adopts it as `files` so each row can be removed.
- **Browse goes through `electronAPI.showOpenDialog` (from B)**: "Choose files" (`openFile`, `multiSelections`) and "Choose folder", with `defaultPath` = `general.defaultDirectory`. e2e drives these with the dialog stubs, extended to return several paths. Drop resolves paths with a new `electronAPI.files.getPathForFile` (preload `webUtils.getPathForFile`; Electron 41 has no `File.path`). Drop is covered by vitest only.
- **Ready-schema facts (from B)**: when `plan.kind === 'copy-gz'`, the files card shows the gz row and, under it, a facts list in place of the "Still needed" area: File, Format ("Compressed schema (.gz)"), Tables (`schemas.length`), Game in file, Version in file (`meta` major.minor, or "None"), Database name (or "None"), and Saves as (`plan.target.fileName`, or "—" while a blocking problem leaves no target). The plan carries them as `facts: GzFacts | null` (`{ tables, fileMeta: { gameType, gameYear, major, minor, databaseName } | null }`, each field nullable). The values come from the scan, which already parses the JSON to sniff the content. The Options card stays for copy-gz.
- **"Add default schemas"** maps to `generateSchemaV2`'s `extraSchemas`: `undefined` when checked, `{}` when unchecked. `{}` is a 4.4.1 workaround that lives in one function (`extraSchemasArg`), pinned by a unit test. It applies to generate only. For copy-gz the Advanced Options card is **hidden**. The checkbox value is kept in the request and comes back if the gz is removed and FTX files are added. When it's unchecked, an info line says the editor still adds the default tables when it loads the schema (`evaluateSchemaGzip` merges them).
- **Naming: one file per identity (decision 9).** The name is always `{M|C}{yy}_{major}_{minor}.gz`. No suffixes. See "Naming" for the rules and the alternatives that were considered.
- **Two-phase validation**: inspect reads headers only (root attributes + `IncludeFile`s, stopping at `<schemas>`, with a 4 MB cap), cached by `(path, size, mtimeMs)`. Add does the full work: `XMLValidator` on every FTX (the library accepts malformed XML and returns a partial schema; verified on 4.4.1), `generateSchemaV2`, empty-enum / no-tables checks (an empty enum crashes at load; verified), serialize, write to `<userData>/schema-staging/` (a sibling, because the picker scans subfolders of `schemas/`), load it back with `FranchiseSchema`, then the replace step from "Naming". Problems found at Add come back as `{status:'blocked', plan}` and use the same problem list.
- **Saved format for generate**: gzip of `{ meta: {major, minor, gameYear, gameType, databaseName}, schemas, enumMap }`, the normalized shape `evaluateSchemaGzip` reads (round trip verified). The meta always comes from the chosen options.
- **Serialized writes**: v5 adds and restores run through one queue in FranchiseFileManager (`_schemaDirExclusive`), and the manager hands the importer a small port: schema dir, staging dir, previous dir, saved-schemas list, loaded paths (with the file each is loaded by), cache invalidation. v4's writers stay outside the queue; their behaviour is frozen.
- **One add at a time in the renderer**: the Add button is disabled while an add runs. Main does not rely on that (see `confirmedTarget`).
- **After success**: navigate to `/schema-management` with `state.added`. That page shows a success Banner, "Added Madden 27 900.1" (or "Replaced your custom Madden 27 900.1"), with these actions (the Banner allows three):
  - View: opens the viewer.
  - Undo: only when the add replaced files. Calls `schema:restore-previous`.
  - "Use it in <file>": only when an open file has a replaced copy loaded. It calls the existing `loadSchema(fileId, path)`.

  Warnings from the result are listed under the banner.
- **Sub-route navigation**: `#/schema-management/add` belongs to the `schema-management` tab. In `src/renderer/src/tabs/editorTabs.ts`, selecting the active tab navigates to its href when the current path is a sub-path of it. `src/renderer/src/hooks/useMenuState.ts` matches a nav item when the path is its href or starts with `href + '/'`. Both get vitest cases.

## Naming
### Rule
- One custom file per identity: `schemas/{M|C}{yy}_{major}_{minor}.gz`.
- The picker reads the custom folder before bundled (verified: `pick(27,620,0)` returns the custom `M27_620_0.gz` over the bundled one). So a custom file with a bundled twin is used on every open. The Schemas page already labels it "M27 v620.0 (Custom)" (`baseLabel` in `schemaList.ts`). Deleting the custom file goes back to the bundled one. Bundled files are never touched.
- **Replace**: if any custom file already has the identity, Add replaces it. That includes files in subfolders of `schemas/` (the picker reads subfolders first; verified) and any extension (for example a v4 `.FTX`). `plan.target = { fileName, path, replaces: { path, loadedBy: string[] }[] }`. With `replaces` non-empty, the plan shows the info `replaces-custom` naming the files, and Add asks for confirmation first ("Replace your custom M27 365.1? The current copy is kept until your next add, and Undo restores it.").
- **The confirmed target is part of the commit**: `confirmedTarget: { fileName, replaces: string[] }`, the exact name and paths the user saw. Main recomputes the target at Add, and any difference comes back `blocked` with `target-changed`. This covers a double-click, two windows, and files changed on disk.
- **Previous copy**: `<userData>/schema-previous/` holds only what the latest replacing add moved out, plus `journal.json` (`{ identity, added, moved: [{from, to}], state: 'moving' | 'done' }`). The next replacing add clears it first, so disk use is at most one set of replaced files, the same idea as the single `backup.bak`. Steps:
  1. stage and validate;
  2. clear `schema-previous/`, write the journal with `state: 'moving'`;
  3. move each replaced file into it;
  4. rename the staged file onto the target;
  5. set `state: 'done'`, drop the `getSchemaFields` cache entries for every path involved.
- **Recovery**: when the importer is built at startup, a journal still in `moving` means a crash between steps 2 and 5, so it moves every `to` back to its `from` and removes the staged file. That is idempotent: a file already back in place is skipped.
- **Undo** (`schema:restore-previous`): allowed only while the journal is `done` and `added` still has the size and mtime recorded in the journal. It removes `added`, moves the previous files back, and clears the folder. Otherwise it returns `{status:'gone'}` and the banner hides Undo.
- **Loaded files**: replacing a file that an open file has loaded is allowed. The open file keeps its in-memory schema, and the plan shows the info `replaces-loaded` naming the file. The banner then offers "Use it in <file>". (`deleteSchema`'s rule exists because a deleted path dangles; here the path stays valid.)

### Alternatives considered
| Option | What the user sees | Picker today | Cost | Verdict |
| --- | --- | --- | --- | --- |
| **Replace, keep the last replaced copy (chosen)** | One row per version. A re-add replaces it after a confirmation, with Undo. | Uses the new file on every open | Journal + one restore IPC | Fixes findings 2, 3, 4 and 6 at the root, and needs no library change |
| Replace, keep nothing | The same, with no Undo | Same | Smallest | Fine if Undo doesn't earn its place. The confirmation is the only safety net. |
| Keep both, `_YYMMDD` or `_r2` suffix | Two rows per version | Picks the undated file on every open; needs a library tie-break by suffix to change that | A suffix rule, a picker info line, the library change | This is the current plan's shape with its ordering bugs fixed. Users still have to delete the old copy to get the new one used today. |
| Keep both, plus a per-version "Use by default" choice in preferences | Several rows, one marked as default | The editor passes `schemaOverride` on open | A preference, open-path wiring, list UI | The most flexible. It is a feature of its own, not needed to add a schema. |
| User types the name | Whatever they type | Order depends on the name | Validation | Leaves the duplicate problem to the user |

## Games outside games.json (decision 13)
- **The pending-file flow is out of this plan.** On 4.4.1 an open can't reach `schema-not-found`:
  - `schemaPicker.pick` always returns a schema for a year that has any, falling back across versions and game types (verified: `pick(23, …, 'college')` returns `M23_158_18.gz`). It throws only for a year with no schema at all (verified: `pick(28, …)`).
  - `getGameYear` knows only years 19 to 27 from the header bytes, and an unknown compressed franchise file falls back to 27 (read from `dist/index.cjs:8325`, not tested with a real M28 file). So an M28 file is read as year 27 and opens with an M27 schema and the mismatch banner, or fails with a plain error.
  - Common files take their year from the Common File modal, which offers only 19 to 27, and every one of those years has a bundled schema.
- So `_openError`, `SchemaMissingData`, `PendingOpen`, `PendingFileCard` and `PendingOpenContext` are not touched. There is no `pending-file` option source and no "Open <file> with it" banner action.
- **What stays.** `GameIdentity` and "Other game…" let the user add a schema for any game, and an FTX `databaseName` such as `Madden28…` is detected as M28. The Schemas page already lists such a schema under "Other" (`groupSchemas` in `schemaList.ts`).
- **What's deferred.** Opening a file of an unlisted game needs madden-franchise's year detection to learn the new game first. Until it does, an added M28 schema is saved and listed but never picked for an M28 file. Revisit the pending flow in the library plan ([../madden-franchise-schema-import.md](../madden-franchise-schema-import.md)) when that changes.
- The case users actually hit is a version mismatch within a known year. The file is open then, so the `open-file` source guesses the version on this page.

## Files

### Main (new, v5 only)
- `main/services/schemaImport/index.js`: `class SchemaImporter { constructor(port); recover(); inspect(request): Promise<AddSchemaPlan>; add(commit): Promise<AddSchemaResult>; restorePrevious(): Promise<RestoreResult> }`. This is the only module that may be required from outside the folder. It shape-checks the untrusted request (boundary).
- `main/services/schemaImport/scan.js`: `scanAll(paths) → FileScan[]` (folder expansion, dedupe that ignores case, cache), `scanFile`, `readFtxHeader(stream)`, `includeKey(name)` (strip `.FTX`, lowercase; the library's rule, pinned by a test), `nameIdentity(fileName)` (the picker's regex; pinned against `schemaPicker.retrieveSchemas`).
- `main/services/schemaImport/plan.js`: pure `planAdd(scans, request, env) → AddSchemaPlan`, `env = { games, savedSchemas, loadedPaths, open, schemaDir }` where `open` is `{ path, game, expected } | null`. Covers classification, the include graph (entry = the unique root; with several roots, the larger reachable set wins and the rest are `unused`; a tie is `several-entrypoints`; no root is `no-entrypoint`; any cycle reachable from the entry is `include-cycle`), option resolution through `OPTION_SOURCES`, the target (`targetFor(identity, savedSchemas, loadedPaths)`), `facts`, problems and `canAdd`.
- `main/services/schemaImport/commit.js`: `buildAndCommit(plan, scans, commit, port)`, `extraSchemasArg(bool)`, `serialize(root, meta)`, `withMeta(gzBuffer, meta)` (copy-gz rewrite), `checkGenerated(root)`, `validateStaged(path)`.
- `main/services/schemaImport/previous.js`: the journal: `replace(staged, target, replaces, port)`, `recover(port)`, `restore(port)`.
- `main/handlers/schemaImportHandler.js`: `registerSchemaImportHandlers(loggedIpc, importer)` with `schema:inspect-add`, `schema:add` and `schema:restore-previous`. All return `{error}` on unexpected failure.
- `main.js`: build the `SchemaImporter` from `franchiseFileManager.schemaImportPort()`, call `recover()` before registering the handlers.
- `main/services/FranchiseFileManager.js`: add `schemaImportPort()` and `_schemaDirExclusive(fn)`. No existing method changes.
- `package.json`: add `fast-xml-parser` (already transitive via madden-franchise) to `dependencies` for `XMLValidator` and the header read.

### Preload / shared types
- `preload/franchisePreload.js`: `electronAPI.schema.inspectAdd(request)`, `electronAPI.schema.add(commit)`, `electronAPI.schema.restorePrevious()`, `electronAPI.files.getPathForFile(file)` (`webUtils`).
- `src/shared/types/addSchema.ts`: `GameIdentity` (`{gameType, gameYear}`), `SchemaIdentity` (`GameIdentity & {major, minor}`), `AddSchemaOverrides`, `AddSchemaRequest`, `AddSchemaCommit` (`acceptMissing`, `confirmedTarget`), `SchemaKind`, `GzFacts`, `FileRole`, `OptionSource`, `ProblemCode` (closed list), `Problem`, `PlannedFile`, `PlannedOption<T>`, `AddSchemaTarget`, `AddSchemaPlan`, `AddSchemaResult` (`added` carries `replaced: boolean` and `loadedBy`), `RestoreResult`, plus the export from the types index.
- `src/renderer/src/preload.d.ts`: declare the four new methods.

### Renderer
- `src/renderer/src/App.tsx`: route `schema-management/add` → `AddSchema`.
- `src/renderer/src/routes/AddSchema/AddSchema.tsx`: the page. `GridLayout columns='2fr 1fr' rows='auto 1fr'`. Left: `SchemaFilesCard` spanning both rows. Right: `OptionsCard` over `AdvancedOptionsCard` (not rendered for copy-gz). Below: `ProblemList`, a summary line ("Generates M27_900_1.gz from 1 entry file and 14 includes", "Copies M27_620_0.gz and writes its meta", "Replaces your custom M27_620_0.gz"), and the **Add schema** button. While a blocking problem is shown, the summary reads as conditional ("Will generate M27_900_1.gz once the problems above are fixed"), so it never sounds like a promise. "Back to schemas" link in the header.
- `routes/AddSchema/useAddSchema.ts`: owns the request. Inspects at once on file changes and 250 ms after option typing, drops stale replies by sequence number, and runs the add flow: one confirmation when `plan.missing` or `target.replaces` is non-empty (a single modal that lists both when both apply) → add with `acceptMissing` and `confirmedTarget` → navigate, or show the blocked plan. Disables Add while adding. Loader while adding.
- `routes/AddSchema/addSchemaModel.ts`: pure helpers: `addPaths` (dedupe that ignores case), `removePath`, `fieldText`, `gameOptions(plan, games)`, `splitProblems`, `summaryLine`.
- `routes/AddSchema/components/`: `SchemaFilesCard` (drop zone with `data-dragging`, the two choose buttons, rows with `data-role` / `data-path`, Remove, row problems, the "Still needed" list, or `GzFactsList` for copy-gz), `GzFactsList` (a `<dl>` with `data-fact=<key>` on each value), `OptionsCard` (Game Dropdown with "Other game…", two Textboxes, source hint, "Use <detected>" when overridden, including while "Other game…" is open), `AdvancedOptionsCard`, `ProblemList` (`data-problem=<code>`).
- `src/renderer/src/components/Checkbox/` (new shared component + story + test).
- `routes/SchemaManagement/components/SchemaActionBar.tsx`: enable "Add schema" (`data-action='add-schema'`, `onAddSchema`). `SchemaManagement.tsx`: navigate to it, and show the `state.added` banner with its actions.
- `tabs/editorTabs.ts`, `hooks/useMenuState.ts`: the sub-route rules above.

## Problem codes
Blocking: `no-files`, `several-schemas`, `mixed-kinds`, `not-a-schema` (row), `duplicate-name`, `include-cycle`, `several-entrypoints`, `no-entrypoint`, `no-database-name`, `game-required`, `version-required`, `invalid-version`, `malformed-xml` (Add), `empty-enum` (Add), `no-tables` (Add), `missing-changed` (Add), `target-changed` (Add).
Warning: `missing-include` (confirmed at Add), `version-guessed`, `missing-includes-accepted` (result).
Info: `meta-written`, `replaces-custom`, `replaces-loaded`, `defaults-merged-at-load`.

## Edge cases
- 0 files: `no-files`. 2 ready schemas: `several-schemas`. gz + FTX: `mixed-kinds`. Unreadable file, folder or non-schema: `not-a-schema` on its row. Same include key from two paths: `duplicate-name`.
- An entry without `databaseName` while an include has one: the header follows the depth-first order above. None at all: blocking `no-database-name` (the library would throw a TypeError).
- An include named in a file that is itself unused: not counted as missing.
- Version text `''`, `1.5` or `-1`: `invalid-version`. Year text in "Other game…" follows the same rule.
- A gz with no meta and a name the regex can't read, with no open file: `game-required` and `version-required`; the user types them.
- A gz with meta that disagrees with its file name: meta wins, and the "From file meta" hint shows it.
- Inspect and add race (files changed on disk): add rescans and replans and never trusts a plan from the renderer.
- Double-click or a second window: the second add sees `replaces` = the file the first add just wrote, which differs from its `confirmedTarget.replaces` (`[]`), so it comes back `blocked` with `target-changed`.
- Crash mid-add: before step 2, only a leftover in `schema-staging/` (cleared at the start of each add). From step 2 to 5, `recover()` rolls back at the next start.
- Navigating away mid-inspect: the reply is ignored (unmounted). Nothing is held in main.

## Interrogation fixes (2026-11-16)
| Finding | Fix in this plan |
| --- | --- |
| 1. Pending flow can't work: unlisted game, no expected version | `GameIdentity` + "Other game…". The pending flow itself was later dropped as unreachable on 4.4.1 (decision 13). |
| 2. A corrected re-add is never used | One file per identity, replaced in place |
| 3. `duplicate-not-auto-picked` wrong; dated copies ordered by month | No suffixes; the info code and L9's revision rule are gone |
| 4. A gz with no meta gets the open file's version | `file-name` source before `open-file`; `version-guessed`; meta always written when missing or different |
| 5. Include cycle hangs Add | `include-cycle` found in `planAdd` before generation |
| 6. Double-click makes two files | `confirmedTarget` in the commit; Add disabled while adding |
| 7. e2e steps contradict the tree | Step 1 asserts `data-name`; step 3 picks "CFB 27" |
| 8. Schemas tab dead on the Add page | Sub-route rules in `editorTabs.ts` and `useMenuState.ts` |

## Library changes
These are a separate plan in the madden-franchise repo: [../madden-franchise-schema-import.md](../madden-franchise-schema-import.md). This feature ships on 4.4.1 and doesn't wait for them. Each library change deletes one app workaround in one file, and no IPC or types change. Pin tests (`{}` extras, a missing include resolves silently, an include cycle recurses, custom is picked over bundled, subfolders are read first) are written to fail on the bump that changes the behaviour, so the workaround gets removed or rechecked.

## Verification
- **node:test** `tests/unit/schemaImportPlan.test.js` (pure `planAdd`, literal scans): every problem code, the kind table (a self-contained FTX → generate), entry choice, cycles (self include, cycle under a single root, cycle only in an unused file), every `OPTION_SOURCES` row in order, the game list for an unlisted detected game (an FTX with `databaseName` `Madden28…`), `version-guessed` only for the `open-file` source, `meta-written` with the changed fields, the target (free name; a custom copy at the root, in a subfolder and as `.FTX` all land in `replaces`; a bundled-only twin leaves `replaces` empty; `replaces-loaded` with `loadedBy`), `acceptMissing` / `confirmedTarget` mismatch, `canAdd`, and `facts` (set for copy-gz, null for generate, `fileMeta: null` for a gz without meta).
- **node:test** `tests/unit/schemaImport.test.js` (temp userData, the real library, fixtures): content sniffing (gz bytes in `.txt`, FTX in `.gz`, BOM), the header read stops early, the header order matches `generateSchemaV2`'s meta on `order/`, inspect writes nothing, generate loads back with the nested include + case fallback, defaults on/off (pins `{}` and the load-time merge), `malformed-xml` and `empty-enum` blocked with nothing written, copy-gz byte-identical when meta matches and rewritten otherwise (a meta-less gz saved and then opened with the M22 fixture raises no mismatch), a re-add replaces the custom copy and the picker then loads the new one, a bundled twin is shadowed by the added custom file, the journal (crash after each step then `recover()`, run twice), Undo restores and is refused after the added file changed, staging is empty after a block, cache invalidation, two concurrent adds (`target-changed`), the library pin tests, and the import guard (nothing outside the folder requires its internals).
- **Fixtures**: `tests/data/schemas/ftx/{gen,college,standalone,bad,cycle,order}/` (the 12 hand-written FTX files from the arena, plus `cycle/` and `order/` from the interrogation, checked against 4.4.1). gz inputs are built in the test.
- **vitest**: `addSchemaModel.test.ts` (including `gameOptions`), `useAddSchema.test.ts` (debounce, stale reply, the confirmation for missing only, replace only and both in one modal, Cancel sends nothing, Add disabled while adding, blocked, error), `AddSchema.test.tsx` (role badges, row problems, button states, the Advanced card hidden for copy-gz and back with its value after switching to FTX, the facts list with "—" for Saves as while blocked, source hints, "Other game…" keeping "Use <detected>", game candidates, the conditional summary while blocked, result-phase warning text in the banner), `SchemaFilesCard.test.tsx` (drop through a mocked `getPathForFile`, folder rows), `Checkbox.test.tsx`, `SchemaActionBar.test.tsx` updated, `editorTabs` and `useMenuState` sub-route cases, the banner actions in `SchemaManagement.test.tsx`.
- **e2e** `tests/e2e/scripts/react/add-schema.spec.js` + model `models/react/AddSchemaPage.js`. `dialogStubs.stubOpenDialog` takes an array (its 6 existing callers keep passing one path). Fixtures are copied into `sandbox.dir`.
  1. generate happy path: the M27 card has a row with `data-name='M27 v900.1'`; `M27_900_1.gz` on disk loads in the test process.
  2. a missing include shows the warning and "Still needed" with Add enabled; Add opens the confirmation (`stubMessageBox`), Cancel writes nothing; confirming with one missing saves, and the banner shows `missing-includes-accepted`. Adding the file clears the warning.
  3. a gz with year 27 and no meta or name hint: the facts list shows Tables and "Version in file: None", Saves as is "—" and there is no Advanced Options card; `game-required`; pick "CFB 27" and type the version, Saves as becomes `C27_…`, and the saved file's meta has the chosen values.
  4. replace: add a tree, add a changed tree with the same identity, confirm (`stubMessageBox`); one file on disk with the new content, opening the M22 fixture (if the identity is M22's) uses it; Undo brings the first back.
  5. malformed XML: problem shown, nothing written.
  6. folder pick expands to rows.
  7. the Schemas tab from the Add page goes back to the list.
  8. ` @slow`: defaults unchecked; the saved JSON lacks the default table.
- Run `npm run test:unit`, `npm run typecheck`, `npm run lint`, `npm run test:react`, `npm run build:react`, `npm run e2eTest:react`, and the full `npm run e2eTest` once (v4 untouched).
- Update the 04a row in `04-parity.md` (add half: plan link + status).

## Implementation split (after approval)
1. Shared types + preload + `preload.d.ts`. Small, done first by hand, because 2 and 3 depend on it.
2. Main `schemaImport/*` + handler + FFM port + unit tests + fixtures.
3. Renderer route + components + Checkbox + tab/menu sub-route + banner actions + vitest.
4. e2e spec + model + dialog-stub change, after 2 and 3.

2 and 3 run in parallel; they share only the types from 1. Then the full diff is reviewed against this plan.

## Resolved with the user (2026-11-15)
1. ~~Missing includes: block, with a "Generate anyway" override.~~ Superseded by 12.
2. The field is labelled "Game".
3. A self-contained FTX is converted to `.gz`, with the default schemas added (it goes through generate).
4. ~~Never replace. An existing identity gets a `_MMDDYY` suffix.~~ Superseded by 9.
5. The library changes are a separate plan (the user maintains madden-franchise).

## Resolved with the user (2026-11-16, after the prototype comparison)
6. One Add schema page (A). No separate "Import schema file" action, modal or redirect.
7. A ready `.gz` shows B's facts summary, and the Advanced Options card is hidden for it.
8. Success shows A's banner on the Schemas page, not a result dialog.

## Resolved with the user (2026-11-16, after the interrogation)
9. Naming: one file per identity, replaced after confirmation, with the last replaced set kept in `schema-previous/` for Undo. The user signed off on keeping that one previous set on disk.
10. Every gz, with or without meta, shows its meta and lets the user override Game, Major and Minor before saving.
11. A guessed version (`version-guessed`) is a warning only. No extra confirmation before Add.

## Resolved with the user (2026-11-16, after the workflow prototype)
12. Missing includes don't block. Add stays enabled and asks for confirmation, naming the missing files. If the add also replaces a custom copy, the same modal says so. No "Generate anyway" step.
13. The pending-file flow is dropped from this plan, since `schema-not-found` can't be reached on 4.4.1. `GameIdentity` and "Other game…" stay. Opening files of unlisted games waits on the library's year detection (see "Games outside games.json").
14. From the workflow screenshots: result warnings use post-add wording, the summary is conditional while Add is blocked, and "Use <detected>" stays visible while "Other game…" is open.
