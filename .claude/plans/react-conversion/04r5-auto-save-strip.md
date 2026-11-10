# 04r5: Auto-save paused strip

Index: [04r-external-change.md](04r-external-change.md). Renderer and e2e. Needs 04r4.

## Changes
- **`components/AutoSavePausedStrip/` (new)**: `AutoSavePausedStrip.tsx`, `.module.css`, a story in `doc/`. Props: `fileName`, `onReload`, `onBranch`. Text: "Auto-save is paused: `<fileName>` was changed outside the editor." Buttons "Reload" and "Branch and save new" (the existing `Button` component). `role='status'`, `data-testid='auto-save-paused'`. A thin full-width bar, using the banner `info` colors. It's in the layout flow (it pushes the page down; it doesn't overlay it). No close button.
- **`Layout.tsx`**: render it between `Navigation` and `Outlet` when `useNotifications()` has a `file-changed` notification with `fileId === openFile?.fileId` **and** `usePreference('general.autoSave', false)` is true. The buttons call `useExternalChange()`'s `reload`/`branch`. Check that the page area still fills the remaining height (the table editor uses the full height).

## Edge cases
- Auto-save off: no strip (nothing is paused). The banner and the drawer still work.
- The strip disappears as soon as the notification is removed (Reload, Branch, save, Dismiss, close), because `useNotifications` follows `notifications:changed`.

## E2E: extend `external-change.spec.js`
- Seed `general.autoSave: true`. Open, `dismissBanners()`, change the file, wait for `[data-testid='auto-save-paused']`.
- Edit a cell → wait ~1s → the bytes on disk equal what was written externally (not auto-saved).
- Click Dismiss on the banner (or the drawer X if the banner timed out) → the strip is gone → poll until the bytes on disk change (the edits were saved).
- Reload from the strip clears it.

## Verification
- Vitest `AutoSavePausedStrip.test.tsx` (the component's text and buttons) and a Layout-level test: shown only for the open fileId with auto-save on; hidden for auto-save off, another fileId or no notification.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`, `npm run build:react && npm run e2eTest:react`.
- Update `04-parity.md`: 04r → Done when all five are done, plus a follow-up row for `unlink` (file deleted or renamed on disk).
