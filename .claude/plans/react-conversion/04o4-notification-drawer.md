# 04o4: Notification drawer on Home

Index: [04o-schema-notifications.md](04o-schema-notifications.md). Needs 04o1 (store and IPC). After this step a mismatched open shows up in the drawer; the banner comes in 04o5.

## Changes

### Data
- `src/renderer/src/notifications/useNotifications.ts`: `list()` on mount, then `onChanged` replaces the list (unsubscribe on unmount). Returns `{ notifications, unreadCount }`.
- `src/renderer/src/notifications/describe.ts`: `describeNotification(n)` → `{ title, description, linkLabel, bannerMessage, bannerSeverity }` per kind. 04o5 uses the banner fields.
  - `schema-mismatch`: title "Schema Mismatch"; description `Loaded M22 v329.1, expected M22 v328.1.`; link "Open Schema Management"; banner message v4's "We cannot find an exact match for this file's schema. Open the schema management page?", severity `error`.
  - Labels use `schemaList.ts`'s format (`M`/`C` from `gameType` + year, `v<major>.<minor>`). Expected drops the year when `expected.gameYear` is unset. A null loaded or expected meta reads "none" / "unknown". Reuse `schemaList.ts`'s label helpers if one takes a bare meta; otherwise add `metaLabel(meta, gameType)` there and use it in both places.
  - The link action is not in `describe.ts` (it needs hooks). The drawer maps kind → action: `schema-mismatch` → `editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY)`.
- `src/renderer/src/notifications/relativeTime.ts`: `relativeTime(createdAt, now)` → "Just now" (< 1 min), "N min ago" (< 60 min), "N h ago" (< 24 h), "N d ago".

### Headline
- `components/Headline/Headline.tsx`: optional `actions?: React.ReactNode`, right-aligned (`margin-left: auto`). Without it the headline renders exactly as now.

### Bell
- New `assets/icons/bell.svg` (same stroke style and size as the other icons).
- In Welcome's Headline `actions`: `<button aria-label="Notifications" data-action="open-notifications" aria-expanded={open}>`, white icon on the orange headline. A badge with the unread count (`data-count`) when it's above 0, "9+" above 9. Clicking toggles the drawer.

### Pane
- Welcome's `Allotment` gets a third `Allotment.Pane` on the right: `minSize` 280, `preferredSize` 320, `snap`, `visible={open}`. `open` is React state in Welcome, false on mount. Snapping it closed sets `open` to false (`onVisibleChange`).
- The left pane and main area must look the same as now while it's closed.

### `routes/Welcome/components/NotificationDrawer/` (new)
- Header "Notifications" with a close button (`aria-label="Close notifications"`).
- The list, newest first. "No notifications" when empty.
- Read state: when the drawer opens, call `markRead` with the ids of every unread notification, and keep a snapshot of which ids were unread at that moment; render "unread" from the snapshot, so the dots stay for this viewing. A notification that arrives while the drawer is open is added to the snapshot as unread and marked read at once. The snapshot is cleared when the drawer closes.
- Each item (`<li data-notification-id data-kind data-read>`): the dot (unread), the title (bold when unread), the description, the time (`relativeTime`, full local date and time in `title`), a link button with `linkLabel`, and a dismiss X (`aria-label="Dismiss <title>"`) that calls `dismiss(id)`.
- Clicking the link runs the kind's action. The drawer stays open (the tab leaves Home anyway).
- The time text refreshes every 60s while the drawer is open.
- No "dismiss all" or "mark all read".

## Verification
- Vitest:
  - `describe.test.ts`: labels, Expected without year, null loaded/expected, college prefix.
  - `relativeTime.test.ts`: each boundary.
  - `NotificationDrawer.test.tsx`: empty state; unread dot and bold kept during the viewing and gone on reopen; `markRead` called on open with the unread ids; a notification arriving while open; dismiss calls IPC; link selects the Schemas tab; time refresh (fake timers).
  - `Welcome.test.tsx`: the bell toggles the pane, the badge count, `aria-expanded`.
  - `Headline` renders unchanged without `actions` (existing snapshot, if any).
- E2E: new `tests/e2e/scripts/react/notifications.spec.js`, `models/react/NotificationDrawer.js` (open, close, items, item fields, dismiss, click link, badge):
  1. Open the M22 test career, open the drawer: one "Schema Mismatch" item, "Loaded M22 v329.1, expected M22 v328.1.", unread, badge 1. Close and reopen: read, no badge.
  2. The link selects the Schemas tab.
  3. Copy the bundled schema to `M22_328_1.gz` in userData, refresh, load it via the Expected link: the drawer is empty.
  4. Load a mismatched schema by hand (from the list): the drawer is empty.
  5. Dismiss X: gone, still gone after switching tabs and back.
  6. Open a second file (the FTC fixture): the career's notification is gone.
  7. UI switch v5 → v4 → v5: the notification is still listed.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`, then `npm run build:react && npm run e2eTest:react`.
- Manual: the drawer at `E2E_WINDOW_SIZE=1024x728`, snapping closed, and Home unchanged with it closed.
