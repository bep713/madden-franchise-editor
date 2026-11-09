# 04o: Schema handling on open, banners and notifications

Index: [04-parity.md](04-parity.md). Builds on [04s3-schema-page.md](04s3-schema-page.md) (the Schemas page, `schemaList.ts`, `revision`, `selectTab`).

## Context
- When a file opens with a schema that doesn't exactly match the one it expects, show a temporary banner at the bottom of the app (v4 parity, but timed), and list a "Schema Mismatch" notification in a new notification drawer on Home so the user can find it after the banner is gone.
- When a file can't be opened because no schema exists for it, show a banner that sends the user to the Schemas page to pick one for that file.
- The banner queue and the notification store are generic, so 04n (updates) and 04r (external-change reload) can use them.

Decisions (confirmed with the user):
- Banner duration: 8000ms, paused while the pointer or focus is on it. It overlays the bottom of the page like v4 (no layout shift).
- One banner at a time (a FIFO queue).
- Notifications live in main, in memory. They survive a UI switch or reload, not an app restart.
- A notification is in the store as soon as the issue is detected, so the drawer lists it while its banner is still up.
- One read state: unread shows a dot and a bold title. Opening the drawer marks everything read. The bell's badge counts unread.
- The drawer is a right `Allotment` pane on Home only, opened from a bell in Home's orange headline. Times are relative ("3 min ago") with the full date on hover.
- Mismatch notifications are removed automatically by any schema load for that file (match or not) and by closing the file (which opening another file does). Loading a schema by hand never notifies.
- Missing schema: a "pending file" mode on the Schemas page, picking from the listed schemas only. "Add schema" stays disabled.
- v4 is not changed. Its banner bugs (below) are avoided in v5 only.

## Facts this relies on
- `schema-mismatch:check(fileId)` (`main/handlers/schemaMismatchHandler.js:15`) returns `{ hasMismatch, expected, used }` with v4's rule: major and minor are equal, and the game year is too if `expected.gameYear` is set. It **throws** when `expectedSchemaVersion` is null (a compressed FTC), because it reads `expectedSchema.major` without a check.
- The M22 test career expects v328.1 and only v329.1 is bundled, so **every React e2e spec that opens it will get the mismatch banner** once 04o5 lands (`schema-management.spec.js:225`).
- `schemaPicker.pick` falls back to the closest major/minor within the game year (and type, then untyped). It returns null only when no schema exists for that game year. The library then fails with a `TypeError` on `.path` inside its parse promise, and `franchise:open-file` returns `{ error: err.message }`. Nothing tells a missing schema apart from any other open error today.
- `loadSchema` reuses `openFile()` internally (`FranchiseFileManager.js:640`), so hooks go in the IPC handlers (`franchise:open-file`, `franchise:load-schema`, `franchise:close-file`), never in `openFile()`.
- Bundled schemas cover years 19–27 and none are untyped, so a common file opened as year 18 has no schema (used by 04o6's e2e).
- v4 banners (`renderer/index.html:18-67`, `_notification.scss`): `position: absolute; bottom: 0`, full width, `z-index: 1000`, 300ms `transform` slide, a 20ms delay before the slide-in. The mismatch banner is red with "We cannot find an exact match for this file's schema. Open the schema management page?" and No / Yes, and has **no timeout**. The only timed banner (no updates) is 3500ms.

## v4 banner bugs (v4 is not changed; v5 must not repeat them)
1. All banners sit at the same spot, so two visible banners cover each other.
2. `updateService.hideNotificationElements()` hides every banner, so the no-updates timer and every update button also close the mismatch banner.
3. `schemaMismatchService.initialize` adds click listeners on every file open, and `navigationService` adds another `"navigate"` listener each time, so after N opens one Yes navigates N times.
4. The 300ms hide timeout is never cleared, so a banner shown within 300ms of a hide gets hidden by the stale timer.

The v5 design avoids each one (04o2): a one-at-a-time queue (1), banners hide only themselves (2), listeners registered once in a provider (3), and every timer is cleared on hide/replace/unmount (4).

## Steps

| Step | Scope | Plan | Status |
|---|---|---|---|
| 04o1 | Main + preload: notification store and IPC, `checkSchemaMismatch` (null fix), mismatch create/remove hooks, `schema-not-found` open error code | [04o1-notification-store.md](04o1-notification-store.md) | Not started |
| 04o2 | React banner queue: `BannerProvider`/`useBanner`, `Banner` component, colors. Not wired to anything yet | [04o2-banner-queue.md](04o2-banner-queue.md) | Not started |
| 04o3 | Move Welcome's open flow into `useOpenFile` (refactor, no visible change) | [04o3-open-file-hook.md](04o3-open-file-hook.md) | Not started |
| 04o4 | Notification drawer on Home: bell, badge, pane, items, read state, `describe.ts`, `useNotifications` | [04o4-notification-drawer.md](04o4-notification-drawer.md) | Not started |
| 04o5 | Mismatch banner: Layout turns new notifications into banners; e2e `dismissBanners()` for existing specs | [04o5-mismatch-banner.md](04o5-mismatch-banner.md) | Not started |
| 04o6 | Missing schema: the `schema-missing` notification, Welcome branch, banner, Schemas pending-file mode | [04o6-missing-schema.md](04o6-missing-schema.md) | Not started |

## Order
- 04o1, 04o2 and 04o3 are independent and can run in parallel.
- 04o4 needs 04o1.
- 04o5 needs 04o2 and 04o4 (it reuses `describe.ts`).
- 04o6 needs 04o3 and 04o5 (and 04o1's error code).
- 04o1 changes the open/load/close IPC handlers, which v4 also uses, so run the v4 e2e project after it, not only the unit tests.
- 04o5 is the first step where a banner can cover the page, so it must add `dismissBanners()` to the shared open helper in the same commit, or existing React specs can fail on blocked clicks.
- After 04o1 and before 04o4, mismatch notifications are created in main but nothing shows them. That's expected.
