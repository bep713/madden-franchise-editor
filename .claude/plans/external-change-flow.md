# External change flow (v5)

Prototype (approved): https://claude.ai/artifact/SPs8a94pxYr3LE5QuzoQRE

## Goal

When the open file changes or goes missing outside the editor, v5 shows one
message (the bar under the tabs), never overwrites the outside change unless
the user confirms it, and only writes when the user saves or auto-save is on.

Rules:

1. One message: the bar (`AutoSavePausedStrip`). No bottom banner for
   `file-changed` / `file-missing`. The drawer keeps the entry and the badge.
2. The bar shows with auto-save on **and** off. With auto-save on it adds
   "Auto-save is paused until you choose." and has no X. With auto-save off it
   has an X that only hides the bar (renderer-local); the change stays
   unresolved.
3. No way to dismiss the change: no Dismiss, no drawer X for these kinds, and
   main refuses `notifications:dismiss` for them.
4. Buttons, in this order, none primary:
   - changed: **Save mine as a copy…**, **Load the new version**, **Keep my version**
   - missing: **Save mine as a copy…**, **Put it back**
5. Load the new version: confirm only with unsaved edits, then reload.
6. Keep my version: always confirms. On confirm main removes the change; it
   writes only if auto-save is on **and** there are unsaved edits (decided in
   main at that moment). Auto-save off: nothing is written; the next Save
   writes without asking.
7. Manual Save (menu / Ctrl+S) while a `file-changed` for the file is stored:
   the Replace confirm. Cancel leaves it unresolved, so every Save asks again.
   Confirm saves (which removes the change, as today). A `file-missing` Save
   writes with no confirm (puts it back), as today.
8. Changing the auto-save setting never writes and never resolves. The bar and
   confirms read the setting live; main's pause check already does.
9. v4 is unchanged (the pause check is already gated on `currentUi === "v5"`;
   v4 doesn't use these notifications' UI).

## Wording (exact)

| Where | Text |
|---|---|
| Bar, changed | `{name} was changed outside the editor. Which version do you want to keep?` |
| Bar, missing | `{name} was deleted or moved outside the editor.` |
| Bar, auto-save on (second line) | `Auto-save is paused until you choose.` |
| Bar X (auto-save off) | aria-label `Hide` |
| Load confirm (only if dirty) | `Load the new version of {name}?` / `Your unsaved edits will be lost.` / button `Load new version` |
| Keep confirm | `Keep your version of {name}?` / button `Keep mine` |
| Keep detail, auto-save off | `Nothing is saved now. When you save, the changes made outside the editor will be lost.` |
| Keep detail, on + edits | `Auto-save resumes and saves your edits now. The changes made outside the editor will be lost.` |
| Keep detail, on, no edits | `Auto-save resumes. Your next edit replaces the changes made outside the editor.` |
| Save confirm | `Replace {name} with your version?` / `The changes made outside the editor will be lost.` / button `Replace` |
| Drawer links | same labels as the bar buttons |

Confirms use the existing `utils/confirm.ts` (native warning box, Cancel default).

## Files

### Main

- `main.js`
  - Remove `onDismissed` from `registerNotificationsHandlers` (reverts today's
    uncommitted fix). Pass `canDismiss: (n) => !EXTERNAL_CHANGE_KINDS.includes(n.kind)`.
- `main/handlers/notificationsHandler.js`
  - Option `canDismiss?: (n) => boolean`; `notifications:dismiss` returns
    without removing when it's false. Drop `onDismissed` (no other user).
- `main/services/FranchiseFileManager.js`
  - `async keepMyVersion(fileId): Promise<{ saved: boolean }>`: inside
    `_runExclusive`, read `changeCount !== savedCount`, call
    `_removeExternalChange(fileId)`; after the lock, if `entry.autoSave` and
    dirty, `await this.requestAutoSave(fileId)` and return `{ saved: true }`.
    (Remove first so `_autoSavePausedCheck` lets the save through.)
  - IPC `franchise:keep-my-version` → `{ saved } | { error }`.
- `main/services/updateInstallGuard.js`
  - When a dirty file has an unresolved `file-changed`, add a detail line:
    `{name} was changed outside the editor. Saving replaces those changes.`
    (Needs the store or a `hasExternalChange(fileId)` on the manager; add
    `hasExternalChange(fileId, kind = "file-changed")` to the manager, reusing
    the store's `list()`.)
- `preload/franchisePreload.js`: `keepMyVersion: (fileId) => ipcRenderer.invoke("franchise:keep-my-version", fileId)`.

### Shared / types

- `src/renderer/src/preload.d.ts`: declare `keepMyVersion(fileId): Promise<{ saved: boolean } | { error: string }>`.

### Renderer

- `context/ExternalChangeContext.tsx`
  - Interface becomes `{ load, keep, copy, putBack, confirmSave }`
    (rename `reload`→`load`, `branch`→`copy`, `saveHere`→`putBack`; update all
    call sites).
  - `load`: existing reload, confirm text per Wording.
  - `keep(fileId)`: read `general.autoSave` (`preferences.getValue`) and
    `hasUnsavedChanges` at click time for the detail text; confirm; call
    `keepMyVersion`; show the error box on `{ error }`.
  - `confirmSave(fileId): Promise<boolean>`: true when no stored
    `file-changed` for the file (`notifications.list()`), else the Save
    confirm's result.
  - `copy`: existing branch (dialog title stays `Save as...`).
- `hooks/useFileMenuCommands.ts`: `'save-file'` awaits
  `externalChange.confirmSave(fileId)` before `saveFile`. The hook runs in
  `Layout` above `ExternalChangeProvider`, so either move the
  `useFileMenuCommands()` call into a small child inside the provider, or
  inline the same check (`notifications.list()` + `confirm`) in the hook. Pick
  the child component (`FileMenuCommands`) so the check lives in one place.
- `routes/Layout/AutoSavePaused.tsx` (rename component to `ExternalChangeBar`?
  no: keep names, smaller diff)
  - Render whenever the open file has a `file-changed`/`file-missing`,
    regardless of auto-save. Pass `autoSave` (live `usePreference`).
  - `hiddenId` state: the notification id the user hid. Bar hidden only if
    `!autoSave && hiddenId === external.id`. A new notification id shows it
    again; turning auto-save on shows it again.
- `components/AutoSavePausedStrip/AutoSavePausedStrip.tsx`
  - Props: `fileName`, `reason`, `autoSave`, `onCopy`, `onHide`, and
    `onLoad` + `onKeep` (changed) or `onPutBack` (missing).
  - Text and button order per Wording. X (`Close` icon, `aria-label='Hide'`,
    `data-action='hide-bar'`) only when `!autoSave`. Keep `data-testid='auto-save-paused'`
    and add `data-reason` (exists).
  - Message wraps; buttons wrap (CSS already flex-wrap).
- `notifications/useNotificationBanners.ts`: skip `file-changed` and
  `file-missing` in `onAdded` (as `update-available`); delete their
  `actionsFor` cases and the `externalChange` ref/import.
- `notifications/describe.ts`
  - Link ids: replace `reload`/`branch`/`save-here` with `load`/`keep`/`copy`/`put-back`.
  - changed links: copy, load, keep. missing links: copy, put-back.
  - `bannerMessage`/`bannerSeverity` stay in the type; for these two kinds
    they're unused (comment says so).
- `routes/Welcome/components/NotificationDrawer/NotificationDrawer.tsx`
  - `linkAction` for the new ids. No dismiss button when
    `n.kind === 'file-changed' || n.kind === 'file-missing'`.
- `components/Banner/Banner.tsx`: only its comment mentions file-changed; update.
- Stories: `AutoSavePausedStrip.stories.jsx` gets changed/missing × on/off.

## Edge cases

- Auto-save toggled while a confirm is open: the confirm's text was read when
  it opened (native box can't update); what happens is decided in main at
  confirm time (`keepMyVersion` reads `entry.autoSave`). Acceptable; the
  prototype's "text changes live" isn't possible with the native box. Note in
  the summary.
- Keep with auto-save on, no edits: removes the change, writes nothing.
- File missing + manual Save: no confirm (Put it back semantics), unchanged.
- Save As (`save-file-as`) writes elsewhere: no confirm, change stays.
- Close file: main already removes the file's notifications.
- UI switch to v4 with an unresolved change: v4 doesn't pause; unchanged.
- A save error in `keepMyVersion`'s auto-save: `requestAutoSave` logs and
  swallows; the change is already removed. Same as today's auto-save failures.
- The game rewrites the file again after Keep: a new `file-changed` arrives,
  the bar returns (new id, so a previous hide doesn't apply).

## Verification

Unit (`npm run test:unit`, `tests/unit/externalChange.test.js`):
- replace the `onDismissed` test with: dismiss of `file-changed`/`file-missing`
  is refused; other kinds still dismiss.
- `keepMyVersion`: removes the change; auto-save on + dirty writes
  (mtime changes); auto-save on + clean writes nothing; auto-save off + dirty
  writes nothing and stays dirty.

Vitest (`npm run test:react`):
- `AutoSavePausedStrip.test.tsx`: text and button order for changed/missing ×
  on/off; X only with auto-save off.
- `AutoSavePaused.test.tsx`: shows with auto-save off; hide works only with
  auto-save off; a new notification or turning auto-save on shows it again.
- `useNotificationBanners.test.tsx`: no banner for file-changed/file-missing.
- `describe.test.ts`, `NotificationDrawer.test.tsx`: new links; no dismiss
  button for these kinds.
- `ExternalChangeContext` (new test): `keep` detail text by auto-save/dirty;
  `confirmSave` asks only with a stored file-changed, and again after Cancel.

E2E (`npm run build:react`, then `--project=react`):
- `external-change.spec.js`: rewrite helpers to wait for the bar
  (`strip.waitFor()`) instead of the banner. Tests:
  - change shows the bar only (no banner), plus the drawer entry with the
    three links and no dismiss button.
  - Load the new version drops edits after the confirm; cancel keeps them.
  - Save mine as a copy… moves editing to the new path.
  - Keep my version, auto-save on, with edits: confirm writes the edit; the
    bar goes.
  - Keep my version, auto-save on, no edits: file bytes and mtime unchanged
    (replaces today's "Dismiss with no edits" test).
  - Keep my version, auto-save off, with edits: nothing written; Ctrl+S then
    writes with no confirm.
  - Auto-save off, Save while unresolved: confirm shown; Cancel leaves the
    file unchanged; Save again asks again; Replace writes.
  - Auto-save off: the bar shows (replaces "no strip with auto-save off");
    the X hides it, the drawer entry stays, Save still asks.
  - Paused edits aren't written until a choice (existing test, no Dismiss).
- `external-delete.spec.js`: Put it back recreates; Save mine as a copy…
  writes the new path; paused until Put it back (replaces "until Dismiss");
  rename-back test waits on the bar.
- `tests/e2e/models/react/`: a small `ExternalChangeBar` model (buttons by
  role/name, `hide()`), drop file-changed use of `Banner`.
- Message boxes via `util/dialogStubs.js` (`stubMessageBox`, `messageBoxCalls`).
- `npm run typecheck`, `npm run lint`, `npm run e2eTest:react`, plus the v4
  smoke (`npm run e2eTest:quick`) since main changed.
