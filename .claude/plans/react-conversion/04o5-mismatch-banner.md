# 04o5: Schema mismatch banner

Index: [04o-schema-notifications.md](04o-schema-notifications.md). Needs 04o2 (banner queue) and 04o4 (`describe.ts`). Turns new notifications into banners.

## Changes
- `routes/Layout/Layout.tsx` (inside `BannerProvider`): a small `useNotificationBanners()` hook (`src/renderer/src/notifications/useNotificationBanners.ts`) that:
  - Subscribes to `electronAPI.notifications.onAdded` once (unsubscribe on unmount) and calls `show` with `key = kind + ':' + (fileId ?? '')`, `kind`, and the message and severity from `describeNotification`. It keeps a map of notification id → banner id.
  - Actions per kind. `schema-mismatch`: "No" (just closes) and "Yes" (primary: `markRead([id])`, then `editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY)`).
  - Subscribes to `onChanged`: for each mapped notification id that is no longer listed, `hide` its banner and drop it from the map. So a load, a close or a dismiss also takes the banner away, and opening two mismatched files quickly ends with only the second file's banner.
  - Only `onAdded` makes banners. Notifications that already exist when the page loads (after a reload or UI switch) get no banner.
- Layout needs `editorTabs`, which it already creates, so the hook takes `selectTab` as a parameter.

### E2E harness for existing specs
- `tests/e2e/models/react/Banner.js`: `waitForBanner(kind)`, `message()`, `click(label)`, `close()`, `isVisible()`, `waitForHidden()`.
- `tests/e2e/models/App.js`: `dismissBanners()` closes the visible banner until none is visible (each close may slide in the next one), waiting out the 300ms slide each time.
- `WelcomePage.openFranchiseFile` (React model) calls `dismissBanners()` after the open finishes. It gets an option `{ keepBanners: true }` for the new tests. Check other React open helpers (recent files, game file cards, common-file flow) and do the same there.
- Run the whole React project to confirm no spec regressed because of the overlay.

## Verification
- Vitest `useNotificationBanners.test.ts` (mocked `electronAPI`, fake timers): `onAdded` shows one banner with v4's text; Yes marks read and selects the tab; No only closes; a removed notification hides its banner; existing notifications at mount get none; unsubscribe on unmount.
- E2E, extend `notifications.spec.js` (open with `keepBanners: true`):
  1. Open the M22 test career: the banner shows with v4's text and `data-kind="schema-mismatch"`, and the drawer already lists the notification while the banner is up.
  2. Yes: the Schemas tab is active and the notification is read (no badge).
  3. Timeout: the banner hides after ~8s (poll up to 12s), and the notification is still listed and unread.
  4. Hover keeps it: move the mouse over the banner, wait 9s, it's still visible.
  5. Load a mismatched schema by hand: no banner.
  6. Open a compressed FTC (if a fixture exists; otherwise skip with a note in the spec): no banner.
- `npm run typecheck && npm run lint && npm run test:react`, then `npm run e2eTest` (both projects).
- Manual: open the M22 career in the table editor as default editor; the banner overlays the pagination and leaves after 8s.
