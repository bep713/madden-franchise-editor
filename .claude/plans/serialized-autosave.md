# Serialized writes and coalesced auto-save per file

(Once approved, copy this to `.claude/plans/serialized-autosave.md`, per /plan-big.)

## Context

With autoSave on, a quick double Ctrl+Z shows 7 → 6 → 5 → 6, and the file on disk can end up holding 6 while main's memory holds 5. The cause is in `FranchiseFileManager.writeBulkTableCells` (`main/services/FranchiseFileManager.js:824`):

- It reads `file.settings.saveOnChange` as the user's autoSave setting. But the library's `packFile()` (`node_modules/madden-franchise/dist/index.cjs:7968`) sets that flag to false while a save runs. So a write that arrives during a save never saves.
- That write returns right away, while the earlier write is still waiting on `file.save()`. The responses reach the renderer out of order, and the older copy of the record overwrites the grid row through `Object.assign` in `planWriteResult`.

The fix has three parts:

1. Per-file write lock: run file operations one at a time.
2. Store the autoSave setting on the entry, and keep the library's `saveOnChange` off.
3. Coalesced auto-save: while a save is running, later requests share one follow-up save.

No renderer changes.

## Design

All changes are in `main/services/FranchiseFileManager.js`, plus one handler.

### 1. Per-file lock

- New `this._fileQueues = new Map()` (fileId → tail promise) in the constructor. It's keyed by fileId, not stored on the entry, because `loadSchema` → `openFile(..., { fileId })` replaces the entry object.
- `_runExclusive(fileId, fn) → Promise`: chains `fn` after the current tail, and stores a tail that never rejects (`.catch(() => {})`) so one failure doesn't block the queue. It returns `fn`'s own promise.
- Wrap the bodies of `writeBulkTableCells`, `setTableRecordsEmpty`, `setTableNextRecordToUse`, `saveFile` (also covers `saveFileAs` and `saveFileAsAndOpen`) and `loadSchema` (so a reopen doesn't read a half-written file). Look up the entry inside the task, so a file closed while a task waits throws the usual "File not found".
- External import (`main/handlers/externalDataHandler.js:186`, `external-data:import-bulk`): run its body through `franchiseFileManager._runExclusive`. Replace its `flipSaveOnChange` / `file.save()` / `saveOnChange = true` block with `franchiseFileManager.requestAutoSave(fileId)`. The current block has the same bug, and it also turns `saveOnChange` on unconditionally.
- `closeFile` stays synchronous. Queued tasks keep their own `file` reference and finish. Delete `_fileQueues` and the auto-save state for that fileId.

### 2. autoSave on the entry

- `_buildFileSettings`: always `saveOnChange: false`. It still works out `autoSave` (`options.autoSave ?? preference`) and returns it beside `settings`, or `openFile` calls a small `_resolveAutoSave(options)`.
- `openFile` ready handler: `activeFiles.set(fileId, { file, path, autoSave })`.
- `_applyPreferencesToFile(file, prefs)` stops setting `saveOnChange`. It only sets `autoUnempty`, and still forces `saveOnChange: false`.
- `applyPreferenceSettings` also sets `entry.autoSave` from the preference for every entry.
- Behavior change: `options.autoSave`, if given, now wins over the preference. Today `_applyPreferencesToFile` overwrites it on ready. No caller passes it today. Unit tests will use it.
- Remove the `saveOnChange` save/restore in `writeBulkTableCells`. Keep `suppressChangeEvents`, which only controls the coalesced `table-changed` emit.

### 3. Coalesced auto-save

- New per-fileId state `this._autoSaves = new Map()` → `{ pending: Promise | null }`.
- `requestAutoSave(fileId) → Promise<void>`:
  - If `entry.autoSave` is false, return a resolved promise.
  - If a save is already queued and **not started**, return its promise. This is the coalescing.
  - Otherwise, queue a save task with `_runExclusive`. When the task starts, it clears `pending` first, so requests made while it runs queue a new save. Then it awaits `entry.file.save()`.
  - Errors are logged with `console.error` and the library's `save-error` emit, and never rethrown to the writer.
- Callers that change data request it:
  - `file.on("change")` in `openFile`: call `requestAutoSave(fileId)` before the `suppressChangeEvents` early return. This covers `record.empty()` in `setTableRecordsEmpty`, `setNextRecordToUse`, and anything else that sets library fields, which used to rely on the library's own `packFile()` call.
  - The save task is queued behind the write task that is running, so it never starts in the middle of a batch. That includes `writeBulkTableCells`' `YIELD_EVERY` yields.
- **Writes don't await the auto-save.** `writeBulkTableCells` drops its `await file.save()` and returns once memory is updated. Rapid undos then answer in write order without waiting for deflate. Saves still emit `saving`/`saved`, so the window title's "Saving..." and the chokidar `pendingSaves` guard in `main.js:566` still work.
- A manual `saveFile` is its own queued task and isn't merged with a pending auto-save. A second save is harmless.

### Edge cases

- Undo during a save: the write waits for that save (it holds the lock), then requests a save. Several writes queued behind one save share a single follow-up save.
- Save As (`saveFileAsAndOpen`) changes `file.filePath` inside its task, so later auto-saves go to the new path.
- A write that fails part-way still triggers change events, and so a save of whatever was written. That's the same as today.
- `setTableRecordsEmpty` returned without waiting for its save before, and it still does.

## Files

- `main/services/FranchiseFileManager.js`: `_runExclusive`, `requestAutoSave`, `_fileQueues`/`_autoSaves`, settings and entry changes, wrapping the write methods.
- `main/handlers/externalDataHandler.js`: the import-bulk lock and auto-save.
- `tests/unit/franchiseFileManager.test.js` (or a new `tests/unit/autoSave.test.js`): see below.
- `tests/e2e/scripts/react/cell-edit.spec.js`: a new autoSave test.
- `CLAUDE.md`: one line under the FranchiseFileManager notes: writes go through `_runExclusive`, and auto-save is `requestAutoSave` (library `saveOnChange` stays off).

## Verification

- **Unit tests** (node:test). Copy `tests/data/m22/career/CAREER-M22TEST` into an `fs.mkdtempSync` dir, open it with `{ autoSave: true }`, and count `saving` events on the file.
  - Write field A = 5, 6, 7, awaiting each. Then fire two writes (6, then 5) without awaiting, as a fast double undo. The responses resolve in call order, and the last one has A=5.
  - Wait for the queue to drain (`await manager._runExclusive(fileId, () => {})`), open the temp file again, and check that A=5 on disk. This is the regression for the lost save.
  - Five writes fired together cause at most 2 saves.
  - With `autoSave: false`, nothing is saved: the file's mtime and bytes are unchanged.
  - A rejected task doesn't block the next one, e.g. a write to an unknown table followed by a valid write.
- **E2E** (`react/cell-edit.spec.js`): launch with `preferences: { general: { autoSave: [true] } }`. Type 5, 6, 7 into one cell, then press Ctrl+Z twice with no wait in between. Poll the grid with `util/poll.js` until it settles, then check it shows 5. Read the file from disk with the existing `readPlayerColumn` helper and check 5 there too.
- Run `npm run test:unit`, `npm run build:react`, `npx playwright test tests/e2e/scripts/react/cell-edit.spec.js`, then the full `npm run e2eTest` (the v4 specs share this main path).
- By hand: autoSave on in the dev app, repeat the 7 → 6 → 5 steps with fast Ctrl+Z, and check there's no flicker back.
