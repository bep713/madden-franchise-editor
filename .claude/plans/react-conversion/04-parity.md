# 04 — Remaining v4 parity

Roadmap: [plan.md](plan.md). Previous: [03-table-editor-parity.md](03-table-editor-parity.md).

The parity checklist items that 03 didn't cover. Each item gets its own plan file in this folder, written and reviewed before the item starts. Each ports or adds the React e2e specs for its flows (see the testing rule in `CLAUDE.md`).

| # | Item | Plan | Status |
|---|---|---|---|
| 04s | Schema management page: the Schemas tab lists schemas per game, loads, deletes, refreshes, opens the schema folder (04s1 IPC, 04s2 reload revision, 04s3 page) | [04s-schema-management.md](04s-schema-management.md) | Done (04s1 `df8f934`, 04s2 `b225712`, 04s3 `9519810`) |
| 04o | Schema handling on open: the `schema-mismatch:check` prompt and the missing-schema flow (v4 opens the schema manager when `franchise:open-file` returns `{ error }`), plus the bottom banner queue and the Home notification drawer | [04o-schema-notifications.md](04o-schema-notifications.md) | Done (04o1-04o3 `8ead138`, 04o4 `c6933a3`, 04o5-04o6 `897a59f`) |
| 04v | Schema viewer: v4's `schemaViewerService` field browser, as a resizable side pane on the Schemas page that shows any schema (the loaded one from the action bar, others from an eye icon per row) | [04v-schema-viewer.md](04v-schema-viewer.md) | Done (uncommitted) |
| 04h | Schedule page: the Schedule tab (`implemented: false` today) and `general.defaultEditor` = `open-schedule` | Not written | Not started |
| 04r | External-change reload prompt: `file-changed` and `save-new-file`, plus a "File Changed" notification and an auto-save pause (04r1 watcher, 04r2 reload IPC, 04r3 notification links, 04r4 reload actions, 04r5 auto-save strip) | [04r-external-change.md](04r-external-change.md) | Done (04r1 + 04r3 `d3efa86`, 04r2 `1d477f2`, 04r4 `1a58ff3`, 04r5 uncommitted) |
| 04u | External delete or rename: chokidar `unlink` on the open file (deleted or renamed on disk) isn't handled by v4 or v5. Decide what to show and whether to stop auto-save | Not written | Not started |
| 04n | Update notifications: `checking-for-updates`, `update-ready` (with the channel), `update-not-available`, `update-progress`, `update-downloaded`, `update-error`, plus the pending one from `electronAPI.getUpdateStatus()` on mount | Not written | Not started |
| 04e | Remaining v4 e2e ports: `releaseNotes.spec.js`, `updateChannel.spec.js`, `import-roundtrip.spec.js`, and the schedule test in `bulk-edit.spec.js` (after 04h), or a written reason one doesn't apply | Not written | Not started |

## Order
- 04o and 04v build on 04s's page and IPC.
- 04e's schedule test waits for 04h, and its update-channel port may share work with 04n.
- The rest are independent.
