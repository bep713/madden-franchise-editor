# 04o6: Missing schema flow

Index: [04o-schema-notifications.md](04o-schema-notifications.md). Needs 04o1 (`schema-not-found`), 04o3 (`useOpenFile`) and 04o5 (banners from notifications).

## Changes

### Main
- `notificationStore.add` replaces per `kind` + `fileId`, or per `kind` + `data.path` (compared with the `samePath` rule: case- and slash-insensitive) for kinds without a `fileId`.
- `franchise:open-file`: when it returns `code: 'schema-not-found'`, also `add({ kind: 'schema-missing', data: { path, openOptions, game } })`. `openOptions` holds only `gameYearOverride`/`gameTypeOverride` from the call. `game` is `{ gameYear, gameType }` from the metadata read, so the text can name it.
- After any successful `franchise:open-file`, remove `schema-missing` notifications whose `data.path` is the same file.
- Types: `NotificationKind` gets `'schema-missing'`; `SchemaMissingData { path: string; openOptions?: { gameYearOverride?: number; gameTypeOverride?: string }; game?: { gameYear: number; gameType: string } }`; `AppNotification.data` becomes the union.

### Text (`describe.ts`)
- `schema-missing`: title "Schema Missing"; description "<file name> could not be opened because no schema exists for M18." (label from `game`; "this game" when it's missing); link "Choose a schema"; banner "No schema was found for <file name>. Choose one on the Schema Management page?", severity `error`, actions No / Yes.

### Pending file
- New `src/renderer/src/context/PendingOpenContext.tsx`, provided in `App.tsx`: `[pending, setPending]` with `pending: { path: string; openOptions?: …; notificationId?: string } | undefined`. React state only; after a reload the drawer link sets it again.
- Drawer link and banner Yes for `schema-missing`: `setPending({ path, openOptions, notificationId })`, `markRead([id])`, `selectTab(SCHEMA_MANAGEMENT_KEY)`.
- Cleared after a successful open of any file (`useOpenFile` clears it on `opened`).

### Welcome / `useOpenFile`
- On `{ error, code: 'schema-not-found' }`: no message box. Return `{ status: 'error', code }`. The banner comes from the notification main just added. Other errors keep the "Could not open" box.

### Schemas page
- When `pending` is set, the top row shows a `PendingFileCard` (`data-testid='pending-file'`) in place of `LoadedSchemaCard`, in the same grid cell rules: "Choose a schema for <file name>", the game label from the notification text if known, and a "Cancel" link (`data-action='cancel-pending'`) that clears `pending`.
- Every schema name is a `Link` while `pending` is set, even with no file open, including names that are loaded in the current file.
- Clicking one: `useOpenFile().openFile(pending.path, { ...pending.openOptions, schemaOverride: { path: entry.path } })`. No unsaved-changes prompt (the open flow closes the current file, same as opening from Welcome). On `opened`, `pending` is cleared and the default editor opens as for any open. On error, the "Could not open" box shows and `pending` stays.
- The trash icons and the action bar are unchanged. "Add schema" stays disabled.

## Edge cases
- Opening with `schemaOverride` never creates a mismatch notification (04o1's rule), even when the chosen schema is another year.
- The pending path's file is deleted or moved: the open fails with the normal error box; Cancel clears it.
- Two missing-schema opens of the same path: one notification (replace per path), one banner (same key `schema-missing:` + path; the key for kinds without `fileId` uses `data.path`, so update `useNotificationBanners`' key accordingly).
- A pending FTC with remembered overrides: they are in `openOptions`, so the prompt doesn't show again.

## Verification
- Unit: extend `schemaNotifications.test.js`: a `schema-not-found` open adds one `schema-missing` with the path and overrides; a second one replaces it; a later successful open of that path removes it; an open with `schemaOverride` adds no mismatch.
- Vitest: `describe.test.ts` (missing text, unknown game), `useOpenFile.test.ts` (no box on `schema-not-found`, clears `pending` on open), `SchemaManagement.test.tsx` (pending card, links without a file, Cancel, a pick calls `openFile` with `schemaOverride`, error keeps `pending`).
- E2E, extend `notifications.spec.js`: seed `commonFileChoices.json` in userData with the FTC fixture's path → `{ gameYear: 18, gameType: 'madden' }`, open it with `keepBanners: true`:
  1. No message box (`messageBoxCalls` is empty), the banner shows with `data-kind="schema-missing"`, the drawer lists "Schema Missing".
  2. Yes → Schemas tab with the pending card; pick "M22 v329.1": the file opens, `getMetadata().schemaList.path` is the bundled M22 schema, the pending card and the notification are gone, and there is no mismatch notification.
  3. From the drawer link (after letting the banner time out): same pending card; Cancel clears it.
- `npm run test:unit && npm run typecheck && npm run lint && npm run test:react`, then `npm run e2eTest`.
