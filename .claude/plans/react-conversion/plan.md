# React conversion (v5) — roadmap

Branch `v5-react-conversion`. Build a React/TypeScript UI in `src/` next to the v4 vanilla UI, against the same main process. v4 stays the default until the React UI reaches parity.

Each numbered step is its own plan file in this folder. Write the plan before starting a step.

From step 02 on, every step adds or extends a React e2e spec (`tests/e2e/scripts/react/`) for the flows it adds, plus vitest for its logic. See the testing rule in `CLAUDE.md`. Each step plan lists those specs in its Verification section.

| # | Plan | Status |
|---|---|---|
| 00 | [Toolchain](00-toolchain.md): Vite, TS, lint, Storybook, `window.api` preload, `MFE_UI` switch | Done (`0f5951c`, `d8e3f51`, `56d2e8f`) |
| 01 | [Preload APIs](01-franchise-model.md): React uses v4's `window.franchiseAPI` / `window.electronAPI`; `window.api` removed | Done (uncommitted) |
| 02 | [React e2e tests](02-react-e2e.md): Playwright `react` project (`MFE_UI=react`), port the v4 specs React can already pass (smoke, tabs, export, in part), test-per-feature rule | Done (uncommitted) |
| 03 | [Table editor parity](03-table-editor-parity.md): pinning (03a), export/import (03b), jump to column (03c), reference editor (03d), blob editor (03e) | 03a planned; 03b–03e not planned |
| 04+ | Remaining items toward v4 parity (below) | Not planned |

## 04+: Remaining items toward v4 parity
Each item becomes its own numbered plan. Cell editing is a prerequisite for 03b import, 03d and 03e (see [03-table-editor-parity.md](03-table-editor-parity.md)).
- Cell editing through `franchise:write-bulk-table-cells` and save / save-as (`franchise:save-file*`), plus a dirty indicator from the `franchise:table-changed` / `saved` events (declare the existing `on*` subscriptions in `preload.d.ts`).
- Schema handling on open: port the `schema-mismatch:check` prompt and the missing-schema flow (v4 opens the schema manager when `franchise:open-file` returns `{ error }`; React only shows a message box).
- Franchise-common files: v4's FTC year/type override prompt before `openFile` (`ftcModalService`, `gameYearOverride` / `gameTypeOverride`). React opens common files without it.
- Reference navigation (jump to the referenced record, `franchise:get-references-to-record`), enums as dropdowns, empty records. Editing reference cells is 03d.
- App-menu integration (v4's `menuService` toggles menu items per nav item; React needs an equivalent over IPC).

## Out of scope (later)
Schema/settings windows in React; React 19; main/preload to TS under electron-vite; electron-builder cutover (add `out/renderer/**` to `build.files`, flip the default UI); a real frtk dependency (SPEX tables + expression editor).
