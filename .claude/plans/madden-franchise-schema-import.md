# madden-franchise: schema import improvements

For the madden-franchise repo (bep713/madden-franchise, currently 4.4.1). Written from the editor's v5 Add schema work ([react-conversion/04a-add-schema.md](react-conversion/04a-add-schema.md)), which ships on 4.4.1 with a workaround for each item below. Every change is additive and backward compatible, so it fits a minor release (4.5.0). When the editor bumps the dependency, it deletes the matching workaround. Its pin tests fail on the bump and point at the workaround.

Behaviour verified on 4.4.1 with small hand-written FTX fixtures (the editor will have them in `tests/data/schemas/ftx/`; reuse them in `tests/`):
- a missing include only `console.warn`s and the table is left out;
- malformed XML returns a partial schema;
- a tree with no `databaseName` throws a TypeError at `databaseName.includes`;
- an enum with zero members generates, then crashes at load (`_members[0].unformattedValue`);
- `extraSchemas: []` / `undefined` load the defaults, and only a non-array (`{}`) skips them;
- `evaluateSchemaGzip` always merges `getExtraSchemas()` for missing names at load;
- the V2 normalized gz `{meta, schemas, enumMap}` round-trips through `evaluateSchemaGzip`.

## Phase 1: correctness of generation (highest value)

### L1. Diagnostics from `generateSchemaV2`
```ts
type SchemaDiagnostic = {
  level: 'error' | 'warning';
  code: 'missing-include' | 'invalid-xml' | 'no-database-name' | 'empty-enum' | 'unresolved-enum' | 'duplicate-schema';
  file?: string;            // fileMap key
  line?: number; column?: number;
  name?: string;            // include, enum or schema name
  message: string;
};
generateSchemaV2({ fileMap, extraSchemas, includeDefaultExtraSchemas, onProblem = 'report' })
  : Promise<SchemaRoot & { diagnostics: SchemaDiagnostic[]; includedFiles: string[] }>
```
- Run `XMLValidator.validate` on each file before parsing, and report `invalid-xml` with line and column.
- `onProblem: 'throw'` rejects with an `Error` carrying `diagnostics` on the first `error`-level issue.
- No `databaseName` anywhere: an `error` diagnostic; `meta.gameYear = null` instead of a TypeError.
- Remove the `console.warn`.
- Editor workaround removed: its own `XMLValidator` pass and `checkGenerated` in `commit.js`.

### L2. Explicit default-schema switch
`includeDefaultExtraSchemas?: boolean` (default `true`). When it's `false`, `extraSchemas` is used as given (`[]` means none). Keep the old "falsy or empty loads the defaults" rule only when the flag is absent.
Editor workaround removed: `extraSchemasArg` returning `{}`.

### L7. Empty enums
The `FranchiseEnum` copy constructor tolerates `_members.length === 0` (`_maxLength = 0`, or derive it from the attribute's bit length). The generator reports `empty-enum` as a warning.
Editor workaround removed: blocking `empty-enum`.

## Phase 2: one owner for the file format

### L6. `serializeSchema(root, opts?) → Buffer`
This writes the normalized gzip format that `evaluateSchemaGzip` reads, next to that reader, with a round-trip test. `meta` keeps `major, minor, gameYear, gameType, databaseName` plus a `format: 2` marker. Use `ZLIB_CHUNK_SIZE`.
Editor workaround removed: the hand-written `serialize()`.

### L4. Richer `meta`
Both generators set `meta.gameType` ('madden' | 'college', from `databaseName` `CollegeFB`/`Madden`) and `meta.databaseName`. `evaluateSchemaGzip` exposes `meta` as stored.
Editor workaround removed: parsing the game type out of `databaseName`.

### L5. `inspectSchemaFile(path) → Promise<SchemaFileInfo>`
```ts
type SchemaFileInfo =
  | { format: 'gzip-schema'; meta: SchemaMeta | null }
  | { format: 'ftx'; databaseName?: string; meta: SchemaMeta | null; includes: string[]; includeKeys: string[] }
  | { format: 'unknown' };
```
- Sniff by content (gzip magic; `FranTkData` root), not extension.
- For FTX, a streaming read that stops at `<schemas>`.
- `includeKey(name)` is exported and is the same rule `generateSchemaV2` uses to resolve includes. Make that rule one function; today it tries the exact name and then lowercase.
- Editor workaround removed: most of `scan.js` and its key-rule pin test.

## Phase 3: load-time behaviour

### L3. Opt out of the load-time extra-schema merge
`FranchiseSchema` option `mergeExtraSchemas?: boolean` (default `true`). A gz whose `meta.extraSchemas === 'none'` (written by `serializeSchema` when generated with `includeDefaultExtraSchemas: false`) also skips the merge. Plumb it through `FranchiseFileSettings`.
Editor change: an unchecked "Add default schemas" means what it says, and the info caveat goes.

### L8. Evaluate errors and listener leak
- V2 `evaluateSchemaXml`: `.catch(err => this.emit('error', err))`.
- V1: `eventEmitter.once`, not `on`; today each evaluate adds a listener to the global emitter.
- gz: emit `error` instead of throwing synchronously from `evaluate()`.
- Longer term: `FranchiseSchema.load(path, opts): Promise<FranchiseSchema>`.
Editor workaround removed: serializing V1 load-back behind its queue.

### L9. Export the schema file name rule
The editor now keeps one file per identity, so it no longer needs a tie-break for duplicate versions. It still needs the picker's name rule.
- Export `schemaFileName({gameType, gameYear, major, minor})` and `parseSchemaFileName(name)`, the same regex `retrieveSchemas` uses, so the editor doesn't keep a second copy.
- Document the pick order the editor relies on: custom before bundled, and within the custom folder, subfolders before root files.
- Editor workaround removed: `nameIdentity` in `scan.js` and its pin test.

### L10. Include cycles
`generateSchemaV2` sets `parsedFiles[key]` only after a file's includes are parsed, so A → B → A recurses until the process runs out of memory (verified on 4.4.1: 17,000+ reads in 5 s). Mark the file as visited before parsing its includes, and report `include-cycle` as an L1 diagnostic.
Editor workaround removed: none (the editor keeps its `include-cycle` check to explain the cycle before Add). Its pin test is rechecked.

### L11. Year detection for games the library doesn't list yet
Today an editor-added schema for a new game (M28, a new CFB) is saved but never picked, because the open never asks for that year:
- `getGameYear` (`dist/index.cjs:8325` on 4.4.1) matches one byte per known year (`0x30`…`0x37` for 20–27, at `0x24`, `0x2a` or `0x2b`). Anything else falls to `schemaMax`, so a compressed franchise file with schema major ≤ 999 is reported as 27, and above 999 the `find` returns undefined and throws a TypeError. Read from the code; not tested with a real M28 file.
- `schemaPicker.pick` then returns the closest M27 schema, so the open reaches the mismatch banner, not `schema-not-found`.

Proposal:
- Read the year digits as ASCII at the offsets that already carry them, and return `20 + digit` (two digits where the layout has them, so 30+ doesn't collide with 20). Inferred from the byte values in the code; check the offsets on real M25–C27 files before relying on it.
- Return `null` for an unrecognized file instead of guessing 27, and drop the `schemaMax` fallback. The editor already handles a null year by asking (the Common File modal). This is the one change in this plan that isn't strictly backward compatible: a file that opens today only through the 27 fallback would get `null`. Keep the fallback behind an option (`guessUnknownYear`, default `true` in 4.x) if that matters.
- `pick` throws a named `SchemaNotFoundError { gameYear, gameType, major, minor }` instead of the TypeError from reducing an empty list.

Editor change: 04a decision 13 dropped the pending-file flow because `schema-not-found` was unreachable. After this ships, a new game's file reaches it, so revisit that flow (an "Add schema" link from the missing-schema banner, `expected` on `_openError`, opening the file after the add). `_openError` can match the named error instead of `instanceof TypeError`.

## Tests (mocha, `tests/`)
- Fixtures: `gen/` (entry + nested include + case-mismatched include + unused file), `college/`, `standalone/`, `bad/` (malformed, empty enum, no databaseName).
- L1: each diagnostic code; `onProblem: 'throw'`; output unchanged for a clean tree (snapshot of table and enum counts).
- L2: flag false + `[]` gives no defaults; flag absent keeps today's behaviour.
- L6/L4: serialize → evaluate round trip (tables, enum members, meta incl. gameType); bundled gz files still load.
- L5: sniffing ignores the extension; the header read stops early (counted stream); `includeKey` matches generator resolution.
- L3/L7/L8/L9/L10: merge on/off; empty enum loads; evaluate error emitted; listener count stable over 10 evaluates; `parseSchemaFileName` matches `retrieveSchemas` on every bundled name; a self include and A → B → A finish with `include-cycle`.
- L11: each bundled year's fixture header still maps to its year; a header with an unknown digit gives that year (for example 28); an unrecognized header gives `null`, not 27; `pick` for a year with no schema throws `SchemaNotFoundError` with the fields set.

## Order and release
Phase 1 → 4.5.0 (the editor drops 3 workarounds). Phase 2 → 4.6.0. Phase 3 can ship with either. L11 is independent and can ship in any of them. It is the one item that unlocks a feature (opening unlisted games), not just removing a workaround. No breaking changes; `schemaGenerator` (V1) stays for the CAS-scan path.
