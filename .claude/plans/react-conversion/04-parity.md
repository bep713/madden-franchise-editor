# 04 — Remaining v4 parity

Roadmap: [plan.md](plan.md). Previous: [03-table-editor-parity.md](03-table-editor-parity.md).

The parity checklist items that 03 didn't cover. Each item gets its own plan file in this folder, written and reviewed before the item starts. Each ports or adds the React e2e specs for its flows (see the testing rule in `CLAUDE.md`).

| # | Item | Plan | Status |
|---|---|---|---|
| 04s | Schema management page: the Schemas tab lists schemas per game, loads, deletes, refreshes, opens the schema folder (04s1 IPC, 04s2 reload revision, 04s3 page) | [04s-schema-management.md](04s-schema-management.md) | Done (04s1 `df8f934`, 04s2 `b225712`, 04s3 `9519810`) |
| 04o | Schema handling on open: the `schema-mismatch:check` prompt and the missing-schema flow (v4 opens the schema manager when `franchise:open-file` returns `{ error }`), plus the bottom banner queue and the Home notification drawer | [04o-schema-notifications.md](04o-schema-notifications.md) | Done (04o1-04o3 `8ead138`, 04o4 `c6933a3`, 04o5-04o6 `897a59f`) |
| 04v | Schema viewer: v4's `schemaViewerService` field browser, as a resizable side pane on the Schemas page that shows any schema (the loaded one from the action bar, others from an eye icon per row) | [04v-schema-viewer.md](04v-schema-viewer.md) | Done (04v1-04v3 `5b715b6`, 04v4 `860eb1d`, 04v5 `98d7644`) |
| 04h | Schedule page: the Schedule tab (`implemented: false` today) and `general.defaultEditor` = `open-schedule` (04h1 v4/main fixes, 04h2 model, 04h3 hook, 04h4 components, 04h5 page, 04h6 e2e) | [04h-schedule.md](04h-schedule.md) | Planned, awaiting approval |
| 04r | External-change reload prompt: `file-changed` and `save-new-file`, plus a "File Changed" notification and an auto-save pause (04r1 watcher, 04r2 reload IPC, 04r3 notification links, 04r4 reload actions, 04r5 auto-save strip) | [04r-external-change.md](04r-external-change.md) | Done (04r1 + 04r3 `d3efa86`, 04r2 `1d477f2`, 04r4 `1a58ff3`, 04r5 `b351380`) |
| 04u | External delete or rename: chokidar `unlink` on the open file (deleted or renamed on disk) isn't handled by v4 or v5. Decide what to show and whether to stop auto-save | Not written | Not started |
| 04n | Update notifications: `checking-for-updates`, `update-ready` (with the channel), `update-not-available`, `update-progress`, `update-downloaded`, `update-error`, plus the pending one from `electronAPI.getUpdateStatus()` on mount, an unsaved-changes prompt before install, and a Home drawer entry (04n1 controller, 04n2 install guard, 04n3 drawer + preload, 04n4 React, 04n5 e2e) | [04n-update-notifications.md](04n-update-notifications.md) | Done (04n1 `42e02de`, 04n2 `b261edf`, 04n3 `4528974`, 04n4 `65ecb28`, 04n5 `6ac0c74`) |
| 04e | Remaining v4 e2e ports: `releaseNotes.spec.js`, `updateChannel.spec.js`, `import-roundtrip.spec.js`, and the schedule test in `bulk-edit.spec.js` (after 04h), or a written reason one doesn't apply. `import-roundtrip.spec.js` is gone: e2e trim phase 2 (`8ad812f`) moved it to `tests/unit/importRoundtrip*.test.js`, which covers the main-side path both UIs share, so it needs no React port | Not written | Not started (3 left: `releaseNotes`, `updateChannel`, the schedule test) |

## Order
- 04o and 04v build on 04s's page and IPC.
- 04e's schedule test waits for 04h, and its update-channel port may share work with 04n.
- The rest are independent.
