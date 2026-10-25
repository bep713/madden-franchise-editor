# React conversion (v5) — roadmap

Branch `v5-react-conversion`. Build a React/TypeScript UI in `src/` next to the v4 vanilla UI, against the same main process. v4 stays the default until the React UI reaches parity.

Each numbered step is its own plan file in this folder. Write the plan before starting a step.

| # | Plan | Status |
|---|---|---|
| 00 | [Toolchain](00-toolchain.md): Vite, TS, lint, Storybook, `window.api` preload, `MFE_UI` switch | Done (`0f5951c`, `d8e3f51`, `56d2e8f`) |
| 01 | [Preload APIs](01-franchise-model.md): React uses v4's `window.franchiseAPI` / `window.electronAPI`; `window.api` removed | Done (uncommitted) |
| 02+ | React table editor toward v4 parity (below) | Not planned |

## 02+: React table editor toward v4 parity
Each item becomes its own numbered plan.
- Cell editing through `franchise:write-bulk-table-cells` and save / save-as (`franchise:save-file*`), plus a dirty indicator from the `franchise:table-changed` / `saved` events (declare the existing `on*` subscriptions in `preload.d.ts`).
- Schema handling on open: port the `schema-mismatch:check` prompt and the missing-schema flow (v4 opens the schema manager when `franchise:open-file` returns `{ error }`; React only shows a message box).
- Franchise-common files: v4's FTC year/type override prompt before `openFile` (`ftcModalService`, `gameYearOverride` / `gameTypeOverride`). React opens common files without it.
- Reference cells (jump to the referenced record, `franchise:get-references-to-record`), enums as dropdowns, empty records.
- App-menu integration (v4's `menuService` toggles menu items per nav item; React needs an equivalent over IPC).
- A React e2e harness: Playwright launching with `MFE_UI=react` after `build:react`, with page objects under `tests/e2e/models/react/`.

## Out of scope (later)
Schema/settings windows in React; React 19; main/preload to TS under electron-vite; electron-builder cutover (add `out/renderer/**` to `build.files`, flip the default UI); a real frtk dependency (SPEX tables + expression editor).
