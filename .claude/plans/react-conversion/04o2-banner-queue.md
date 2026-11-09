# 04o2: Banner queue (React)

Index: [04o-schema-notifications.md](04o-schema-notifications.md). React only. Nothing shows a banner yet (04o5 does). Independent of 04o1 and 04o3.

## Changes

### `src/renderer/src/components/Banner/` (new, presentational)
- Props: `message`, `severity: 'info' | 'error' | 'success'`, `actions?: { label, onClick, primary? }[]` (at most two), `onClose`, `kind?` (for `data-kind`), `visible` (drives the slide).
- Layout from v4's `_notification.scss`: full width, 20px padding, white text, message on the left, actions on the right (stacked under the message below the medium breakpoint), uppercase transparent action buttons, plus a close button (`aria-label="Close"`, `close.svg`). Severity colors: `info` = v4's `$welcome-link-color`, `error` = v4's error red, `success` = v4's success green, added to `assets/colors.css` as `--banner-info`, `--banner-error`, `--banner-success`.
- `position: fixed; left: 0; right: 0; bottom: 0`. Slide: `transform: translateY(100%)` when hidden, `0` when visible, `transition: transform 300ms ease-in-out`. `z-index` above page content and below `Modal` and `Loader` (read their values and pick one between).
- `role="alert"` for `error`, `role="status"` otherwise. `data-testid="banner"`, `data-kind={kind}`.
- A story in `components/Banner/doc/Banner.stories.jsx`, one per severity.

### `src/renderer/src/banners/BannerContext.tsx` (new)
- `BannerProvider` and `useBanner()` → `{ show(banner): string, hide(id) }`.
- `show({ key?, kind?, severity, message, actions?, durationMs = 8000 })` returns an id.
- **Queue**: one banner is current, the rest wait in FIFO order. When the current one hides, it slides out (300ms), then the next one becomes current and slides in on the next frame (v4's 20ms delay, so the transition runs).
- **Same key**: `show` with a `key` that is current replaces its content in place and restarts its timer; one that is queued is replaced in place in the queue.
- **Timer**: starts when the banner is fully shown. Pauses on `pointerenter` and `focusin`, resumes with the remaining time on `pointerleave`/`focusout` (only when neither the pointer is over it nor focus is in it).
- Any action button and the close button hide the banner after running their `onClick`.
- `hide(id)` on a queued banner drops it; on the current one, slides it out.
- Every timeout is stored and cleared on hide, replace and unmount.
- Mounted in `routes/Layout/Layout.tsx` around the existing content, so banners show on every tab. The provider renders the current `Banner`.

## Verification
- `BannerContext.test.tsx` (vitest, fake timers): FIFO order, same-key replace (current and queued), 8000ms auto-hide, hover pause/resume with the remaining time, focus pause, an action hides and runs its handler, `hide` of a queued id, no late hide after replace or unmount, the next banner starts only after the 300ms slide-out.
- `Banner.test.tsx`: roles per severity, close button, at most two actions.
- No e2e in this step: nothing is user-visible until 04o5, which covers it end to end.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`.
