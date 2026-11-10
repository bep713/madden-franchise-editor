# 04r3: Several links per notification

Index: [04r-external-change.md](04r-external-change.md). Renderer refactor, no visible change. Independent of 04r1 and 04r2. If 04r1 has landed, also convert its `'file-changed'` case; if not, 04r1 writes it with `links` directly.

## Changes
- `notifications/describe.ts`: replace `linkLabel: string` with `links: NotificationLink[]`, where `NotificationLink = { id: NotificationLinkId; label: string }` and `NotificationLinkId = 'open-schemas' | 'pick-schema' | 'reload' | 'branch'`. Mismatch → `[{ id: 'open-schemas', label: 'Open Schema Management' }]`. Missing → `[{ id: 'pick-schema', label: 'Choose a schema' }]`. File-changed (if present) → Reload, Branch and save new.
- `NotificationDrawer.tsx`: render one button per link, keeping `data-action='notification-link'` and adding `data-link={id}`. `linkAction(n)` becomes `linkAction(n, id)`, switching on `id`. `reload` and `branch` are no-ops until 04r4. Lay out several links in a row with a small gap.
- Update the drawer's e2e page model (`tests/e2e/models/react/`) if it clicks `notification-link`: keep the old method (first link) and add `clickLink(id)` by `data-link`.

## Verification
- `describe.test.ts`: `links` for each kind.
- Drawer vitest: one link per entry for mismatch/missing; a file-changed entry (if 04r1 landed) renders two, each with its `data-link`.
- `npm run typecheck && npm run lint && npm run test:react`, `npm run build:react && npm run e2eTest:react` (`notifications.spec.js` unchanged and green).
