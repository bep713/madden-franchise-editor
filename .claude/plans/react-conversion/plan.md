# React conversion (v5) — roadmap

Branch `v5-react-conversion`. Build a React/TypeScript UI in `src/` next to the v4 vanilla UI, against the same main process. v4 stays the default until the React UI reaches parity.

Each numbered step is its own plan file in this folder. Write the plan before starting a step.

From step 02 on, every step adds or extends a React e2e spec (`tests/e2e/scripts/react/`) for the flows it adds, plus vitest for its logic. See the testing rule in `CLAUDE.md`. Each step plan lists those specs in its Verification section.

| # | Plan | Status |
|---|---|---|
| 00 | [Toolchain](00-toolchain.md): Vite, TS, lint, Storybook, `window.api` preload, `MFE_UI` switch | Done (`0f5951c`, `d8e3f51`, `56d2e8f`) |
| 01 | [Preload APIs](01-franchise-model.md): React uses v4's `window.franchiseAPI` / `window.electronAPI`; `window.api` removed | Done (`62ce438`) |
| 02 | [React e2e tests](02-react-e2e.md): Playwright `react` project (`MFE_UI=react`), port the v4 specs React can already pass (smoke, tabs, export, in part), test-per-feature rule | Done (`cbd80c9`, `c257f8a`) |
| 03 | [Table editor parity](03-table-editor-parity.md): cell editing, reference/blob editors and saving (03a), pinning (03b), navigation tabs (03t), open in new tab (03u), export/import (03c), jump to column (03d), inverted-view editing (03e) | 03a done (`bedefcf`, `d28514e`); 03b done (`b1e1d7f`); 03t done (`4249569`); 03u implemented (uncommitted, 2026-10-27); 03c–03e not planned (03e outlined) |
| 04+ | Remaining items toward v4 parity (below) | Not planned |

## 04+: Remaining items toward v4 parity
Each item becomes its own numbered plan. Cell editing and saving moved to 03a (see [03-table-editor-parity.md](03-table-editor-parity.md)). v4 has no dirty indicator, so 03a doesn't add one either. Add one here later if wanted (from `franchise:table-changed` / `saved`).
- Schema handling on open: port the `schema-mismatch:check` prompt and the missing-schema flow (v4 opens the schema manager when `franchise:open-file` returns `{ error }`; React only shows a message box).
- Schedule and Schemas pages: 03t shows their tabs as stubs (`implemented: false` in `data/navigation.ts`) and ignores `general.defaultEditor` = `open-schedule` / `open-schema-viewer`. Each page's plan flips the flag and wires the preference.
- Franchise-common files: v4's FTC year/type override prompt before `openFile` (`ftcModalService`, `gameYearOverride` / `gameTypeOverride`). React opens common files without it.
- Reference navigation beyond 03a's link click: back button / nav history (per table tab, see [03t](03t-navigation-tabs.md)), "Find references to this record" (`franchise:get-references-to-record`). Empty records: the "Set selected record(s) as empty" and "Set as next empty record to use" context menu (03a shows empty rows and updates them after edits).
- App-menu integration for the remaining items: Import/Export, Log Table, Copy Unique ID, raw/FRT export and import, the external-change reload prompt (`file-changed`, `save-new-file`). 03a adds `useMenuState` (`REACT_MENU_IDS`) and handles Save, Save As and Close File; each later item adds its ids there.

## Out of scope (later)
Schema/settings windows in React; React 19; main/preload to TS under electron-vite; electron-builder cutover (add `out/renderer/**` to `build.files`, flip the default UI); a real frtk dependency (SPEX tables + expression editor).
