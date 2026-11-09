# React conversion (v5) — roadmap

Branch `v5-react-conversion`. Build a React/TypeScript UI in `src/` next to the v4 vanilla UI, against the same main process. v5 is the default and v4 stays as legacy (05). 05d flipped the default before the parity checklist was complete, at the user's request, so the branch must not reach `master` until every checklist item is checked.

Each numbered step is its own plan file in this folder. Write the plan before starting a step.

From step 02 on, every step adds or extends a React e2e spec (`tests/e2e/scripts/react/`) for the flows it adds, plus vitest for its logic. See the testing rule in `CLAUDE.md`. Each step plan lists those specs in its Verification section.

| # | Plan | Status |
|---|---|---|
| 00 | [Toolchain](00-toolchain.md): Vite, TS, lint, Storybook, `window.api` preload, `MFE_UI` switch | Done (`0f5951c`, `d8e3f51`, `56d2e8f`) |
| 01 | [Preload APIs](01-franchise-model.md): React uses v4's `window.franchiseAPI` / `window.electronAPI`; `window.api` removed | Done (`62ce438`) |
| 02 | [React e2e tests](02-react-e2e.md): Playwright `react` project (`MFE_UI=react`), port the v4 specs React can already pass (smoke, tabs, export, in part), test-per-feature rule | Done (`cbd80c9`, `c257f8a`) |
| 03 | [Table editor parity](03-table-editor-parity.md): cell editing, reference/blob editors and saving (03a), pinning (03b), navigation tabs (03t), open in new tab (03u), export/import (03c), jump to column (03d), inverted-view editing (03e), back/forward history (03f), grid context menu and References modal (03g) | Done: 03a (`bedefcf`, `d28514e`), 03b (`b1e1d7f`), 03t (`4249569`), 03u (`83a9974`), 03c (`34e6e0b`), 03d (`073e912`), 03e (`30af4c7`), 03f (`32217ef`), 03g (`fc8245f`) |
| 04 | [Remaining parity](04-parity.md): schema management page (04s), schema handling on open (04o), schema viewer (04v), Schedule page (04h), external-change reload prompt (04r), update notifications (04n), remaining e2e ports (04e) | 04s done (`df8f934`, `b225712`, `9519810`); 04o, 04v, 04h, 04r, 04n, 04e not started |
| 05 | [UI switch](05-ui-switch.md): `general.uiVersion` preference, live switch between v5 and legacy v4 keeping the open file, View → Interface menu (05a main, 05b v4 restore + link, 05c React restore + link, 05d v5 default + installer). 05d waits for the parity checklist | Done (05a `95488c6`, 05b `f5f0a10`, 05c `adb41f7`, 05d `eb8453e`). 05d landed ahead of parity; the checklist still gates `master` |

## Parity checklist (gate for 05d and for merging to `master`)
No build with v5 ships, nightly or stable, until every box is checked. v4 stays in the app indefinitely as "legacy", so this is about v5 being complete, not about removing v4.
- [x] Table editor: export/import (03c), jump to column (03d), inverted-view editing (03e), back/forward history (03f), grid context menu and References modal (03g)
- [x] Franchise-common files: FTC year/type prompt (`CommonFileModal`, `react/common-file.spec.js`)
- [x] Schemas page: schema management (04s), and `general.defaultEditor` = `open-schema-viewer`
- [ ] Schema handling on open: schema-mismatch prompt and missing-schema flow (04o)
- [ ] Schema viewer: v4's field browser for the loaded schema (04v)
- [ ] Schedule page, and `general.defaultEditor` = `open-schedule` (04h)
- [x] App menu: every item v4 enables is in `REACT_MENU_IDS` (Save, Export, Import, raw/FRT, Log Table, Copy Unique ID)
- [ ] External-change reload prompt (`file-changed`, `save-new-file`) (04r)
- [ ] Update notifications: React shows `checking-for-updates`, `update-ready` (with the channel), `update-not-available`, `update-progress`, `update-downloaded` and `update-error` as v4's `updateService` does, and reads the pending one from `electronAPI.getUpdateStatus()` (05a) on mount (04n)
- [ ] Every v4 e2e spec has a React port in `tests/e2e/scripts/react/` (or a written reason it doesn't apply). Missing: `releaseNotes`, `updateChannel`, `import-roundtrip`, the schedule test in `bulk-edit` (04e)

## 04: Remaining items toward v4 parity
See [04-parity.md](04-parity.md). v4 has no dirty indicator, so React doesn't add one either. Add one later if wanted (from `franchise:table-changed` / `saved`).

## Out of scope (later)
Schema/settings windows in React; React 19; main/preload to TS under electron-vite; a real frtk dependency (SPEX tables + expression editor).
