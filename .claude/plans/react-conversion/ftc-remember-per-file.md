# Remember FTC (common-file) choices per file

## Context
Opening a franchise-common file in the React UI always shows the "Set File Parameters" modal (`CommonFileModal`). Its checkbox, "Make these my default choices", writes the global `general.ftcGameYearOverride/ftcGameTypeOverride` preferences, so the modal still appears every time. We want the checkbox to remember the choices **for that file path** instead: a remembered file opens with its stored year/type and no modal. A "Change" link next to the open common file's name reopens the modal.

Decisions (confirmed with the user):
- The checkbox becomes "Remember my choices for this file". It no longer writes the global defaults. Those stay editable in the Settings window and still pre-fill the modal for files that aren't remembered.
- Confirming the re-triggered modal re-opens the file with no confirm box, but only if the year or type changed. React has no dirty tracking, so the re-triggered modal always shows an inline line warning that unsaved changes will be lost.

## Storage
`commonFileChoices.json` in userData, read and written through the existing `window.electronAPI.fs.readJson/writeJson`, the same way `usePinnedTables.ts` handles `pins.json`. No IPC or preload changes.
```json
{ "C:\\...\\franchise-common.FTC": { "gameYear": 22, "gameType": "madden" } }
```
Keys are the exact path string from the open dialog, recent files or the saves list (recent files key on the exact path too). Reads and writes swallow and log errors, so a missing or corrupt file behaves like "nothing remembered".

## Changes

### 1. `src/renderer/src/routes/Welcome/components/CommonFileModal/commonFileChoices.ts` (new)
- `COMMON_FILE_CHOICES_FILENAME = 'commonFileChoices.json'`
- `type RememberedChoice = { gameYear: number; gameType: string }`
- `getRememberedChoice(path): Promise<RememberedChoice | null>`: read the file and validate the entry (numeric year, string type). Anything invalid returns null.
- `setRememberedChoice(path, choice | null)`: read, modify, write. `null` deletes the entry. Writes are serialized through a module-level promise queue, like `usePinnedTables`' `writeQueue`.

### 2. `CommonFileModal.tsx`
- Rename `saveAsDefault` to `remember` in `CommonFileChoice` and state. Label: "Remember my choices for this file".
- New prop `initialRemember?: boolean` (default false) sets the checkbox's starting state.

### 3. `useCommonFilePrompt.tsx`
- `promptForOverrides(path, { initial?, remembered?, reopen? })`:
  - Initial values: `initial` if given, otherwise `readDefault(YEAR_KEY/TYPE_KEY)` as now. `remembered` sets `initialRemember`. `reopen` sets the modal's `reopenWarning` line.
- `confirm`: drop the `preferences.set` call. If `choice.remember`, `setRememberedChoice(path, {gameYear, gameType})`. If it's unticked and the file was remembered, `setRememberedChoice(path, null)`, so unticking during a re-trigger forgets the file.

### 4. `Welcome.tsx`
- `initializeFile(path, overrides?)`: for a common file, use `overrides` if given (the re-trigger path), otherwise the remembered choice with no modal, otherwise `promptForOverrides(path)`.
- `changeCommonFileParameters()`: prompt prefilled with the open file's current year and type (`metadata.gameYear`, `metadata.type.gameType || 'madden'`), with `remembered` and `reopen: true`. If they changed, `initializeFile(path, overrides)`, which closes the current file first. Unchanged values only update the remembered choice.

### 5. `Cards/GetStartedCard.tsx`
- For an open common file with a path, the header shows the file name, the game (`game.title`, falling back to the type label and year) in gray body text, and a `Change` link (`data-action='change-file-parameters'`) that emits `GetStartedActions.CHANGE_FILE_PARAMETERS`. No action-bar link.

## Tests

**Vitest**
- `CommonFileModal.test.tsx`: rename the label and `saveAsDefault` to `remember`. Add a test that `initialRemember` pre-checks the box.
- `commonFileChoices.test.ts` (new): get/set/delete against a mocked `fs`, and invalid entries come back as null.
- `Welcome.test.tsx`: add `fs: { readJson, writeJson }` to the `electronAPI` mock, then:
  - Replace "saves the choices as strings with the default box ticked" with "remembers the choices for the path". It checks that `writeJson('commonFileChoices.json', {path: {...}})` was called and `preferences.set` wasn't.
  - A remembered path opens with its overrides and no dialog.
  - The header "Change" link and game label show only for an open common file, not for franchise files.
  - Re-trigger: the dialog is pre-filled with the open file's values, the box reflects whether it's remembered, and the warning line shows. A changed year runs `closeFile` and `openFile` with the new overrides and no message box. Unchanged values or closing the modal opens nothing.

**E2E**: `tests/e2e/scripts/react/common-file.spec.js` and `models/react/CommonFileModal.js`
- Model: `saveAsDefault` locator becomes `remember` ("Remember my choices for this file"), and `setRemember(checked)` is added.
- Update the first spec: tick remember, then assert `commonFileChoices.json` contains the path (read through `window.electronAPI.fs.readJson`). It should no longer expect the global prefs to change; assert they're still "27"/"college".
- New spec, "re-opens a remembered common file without asking (react)":
  1. Open the file with remember ticked, then open it again from recent files or `startOpenFile`. The file opens and the dialog never appears.
  2. Click the header "Change" link. The modal is pre-filled. Choose a different year and confirm. The metadata `gameYear` and the header label change.
- Clean up `commonFileChoices.json` between tests (write `{}` in a `beforeEach`, or launch with a fresh userData if the harness already does that; check `Electron.js`).
- Add a `WelcomePage` model method to click the header link (`[data-action="change-file-parameters"]`).

## Verification
- `npm run typecheck && npm run lint && npm run test:react`
- `npm run e2eTest:react` (builds React first). Both common-file specs should pass.
- Manual: `npm run start:react`, open an FTC file and tick remember, reopen it (no modal), then use the header Change link to pick a different year; it re-opens with no prompt.
