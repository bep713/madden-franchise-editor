# 00 — Toolchain: bring the react-conversion toolchain to v5-react-conversion

## Context
Commit `d3b17fa` copied the React renderer (`src/renderer/**`, `src/shared/**`) from `react-conversion`. It came without the toolchain: no TS config, no bundler, no React deps, and no main/preload that exposes the `window.api` it calls. The goal is to get `src/renderer/index.html` compiling and showing the Welcome page inside Electron, using the **current** main process (main.js + FranchiseFileManager + handlers). The v4 vanilla renderer has to keep working next to it.

Decisions already made: reuse the current main process, keep v4 running, stub the `frtk` type, and include ESLint + Prettier, Stylelint and Storybook.

## What react-conversion used, and the verdict on each

| Package / workflow | Old use | Verdict |
|---|---|---|
| electron-vite 4 (+ electron.vite.config.ts) | bundled TS main/preload/renderer | **Not yet.** main/preload stay as unbundled CJS, so electron-vite would only wrap Vite and would change `__dirname` paths. Use **plain Vite** for the renderer now and keep the config shape (aliases, css modules) easy to move into electron-vite's `renderer:` block when main goes TS. |
| vite, @vitejs/plugin-react, vite-plugin-svgr | renderer build, `*.svg?react` | **Keep** (latest) |
| typescript, @electron-toolkit/tsconfig, @types/react(-dom), @types/node | typecheck | **Keep**. Only tsconfig.web.json plus a small tsconfig.node.json for vite.config.ts |
| react / react-dom 18 | UI | **Keep 18.3** for now (code uses the global `JSX.Element`, which React 19 types removed). Upgrade to 19 separately. |
| react-router-dom 6, classnames, allotment, fuse.js, react-window, react-virtualized-auto-sizer, @fontsource-variable/roboto | imported by renderer | **Keep** |
| @handsontable/react 14 + handsontable 16 | table component | **Swap** to `@handsontable/react-wrapper@16` (the v15+ replacement; `HotTableClass` becomes a `HotTableRef` ref). v4 needs handsontable 11, so install it under an alias (below). |
| @monaco-editor/react + `app-asset://` protocol to load monaco from node_modules | expression editor | **Keep the editor, drop the protocol.** Add the `monaco-editor` dep, use `loader.config({ monaco })` with Vite `?worker` imports, and add `worker-src 'self' blob:` to the CSP. |
| frtk (file:../frtk) | one type in shared/types/franchise.ts (plus old main) | **Stub** `DisassembledInstructionsResult` in `src/shared/types/` |
| electron-better-ipc | IPC | **Drop.** Use the existing `ipcMain.handle` / `domain:action` pattern |
| @electron-toolkit/preload (`window.electron` = raw ipcRenderer) | preload | **Drop**: it exposes raw IPC to the renderer. @electron-toolkit/utils is also unneeded |
| electron-store (`src/shared/store.ts`, unused) | recent files | **Drop.** Delete `store.ts`; `preferencesStore` / `recentFilesHandler` already cover it |
| electron-preferences, @electron/remote, @babel/polyfill, winston, uuid, lz4-napi, concat-stream, electron-rebuild, electron-packager, electron-devtools-installer, node-gyp, esmify, browser-resolve, sinon, proxyquire | legacy | **Drop.** Already replaced by electron-log, `crypto.randomUUID` and the JS LZ4 decoder, or unused |
| electron-updater ^6 | updates | **Do not take.** Stay on 4.6.1 (see CLAUDE.md) |
| electron 37 | | Keep the current **41** |
| vitest + jsdom + @testing-library/{react,jest-dom,user-event} + tests/setup.js | component tests (RecentFilesList snapshot) | **Keep** for renderer tests. Main-process tests stay on node:test |
| Storybook 8 + chromatic + experimental-addon-test + @vitest/browser + vitest.workspace.ts | stories | **Keep Storybook on the current major** with `@storybook/react-vite` only. Drop chromatic, the experimental test addon, @vitest/browser and the workspace file (in Storybook 9+ the essentials are built in) |
| eslint 9 + @electron-toolkit/eslint-config-ts + prettier plugins + eslint-plugin-react + storybook plugin | lint | **Keep**, but use `typescript-eslint` directly and add `eslint-plugin-react-hooks`. **Scope to `src/` only** |
| prettier (.prettierrc: 4 spaces, single quotes, `endOfLine: crlf`) | format | **Keep**, with `endOfLine: lf` to match .editorconfig. `.prettierignore` covers everything outside `src/` so v4's double-quote style stays as it is |
| stylelint + standard + css-modules + recess-order | css lint | **Keep**, and add `stylelint-config-standard-scss` because there are `.scss` modules. Scope to `src/**` |
| husky pre-commit (lint + unit + react tests) | hooks | **Drop husky.** Add `lint` + `test:react` to the existing `.githooks/pre-push` |
| electron-builder.yml (template: example.com publish, npmmirror, mac/linux) and .npmrc mirrors | packaging | **Drop.** Keep the `build` config in package.json; add `out/renderer/**/*` to `build.files` |
| .editorconfig, .vscode/settings.json | | **Bring over** |

## Steps

1. **Dependencies** (`package.json`)
   - deps: react, react-dom, react-router-dom, classnames, allotment, fuse.js, react-window, react-virtualized-auto-sizer, @fontsource-variable/roboto, handsontable@16, @handsontable/react-wrapper@16, @monaco-editor/react, monaco-editor.
   - Rename v4's handsontable to `"handsontable-v11": "npm:handsontable@11.1.0"` (devDep, as today). Update `renderer/js/services/table-editor/TableEditorView.js:2`, `renderer/js/services/abilityEditorService.js:2` and the CSS copy path in `scripts/build-renderer.js:168` to match.
   - devDeps: vite, @vitejs/plugin-react, vite-plugin-svgr, typescript, @electron-toolkit/tsconfig, @types/react@18, @types/react-dom@18, @types/node, vitest, jsdom, @testing-library/react, @testing-library/jest-dom, @testing-library/user-event, eslint + typescript-eslint + eslint-plugin-react + eslint-plugin-react-hooks + eslint-config-prettier + eslint-plugin-storybook, prettier, stylelint + config-standard-scss + config-css-modules + config-recess-order, storybook + @storybook/react-vite.

2. **Config files (repo root)**
   - `vite.config.ts`: `root: src/renderer`, `base: './'` (needed for `loadFile`), `build.outDir: ../../out/renderer`, input **index.html only** (schema.html and settings.html still point at `old/js/*`, so leave them out). Add the `@shared`, `@renderer`, `@assets` and `@data` aliases, the camelCaseOnly CSS-modules config from the old `electron.vite.config.ts`, the react + svgr plugins, and a `test` block (jsdom, `tests/setup.js` ported from the old branch, `include: src/**/*.test.{ts,tsx,jsx}`).
   - `tsconfig.json` (references), `tsconfig.web.json` and `tsconfig.node.json`, ported from the old branch minus the main/preload includes. Include `declaration.d.ts` (port it; it declares `*.scss`).
   - `eslint.config.mjs`, `.prettierrc`, `.prettierignore`, `.stylelintrc.json`, `.storybook/{main,preview}.ts` (main.ts reuses the aliases/svgr via `viteFinal`), `.editorconfig`, `.vscode/settings.json`.
   - `.gitignore`: `out` is already listed; add `storybook-static`, `*storybook.log` and `coverage/`.

3. **Renderer fixes so it compiles**
   - `src/shared/types/franchise.ts`: replace the frtk import with a local `DisassembledInstructionsResult` type (copy its shape from `../frtk/src`).
   - Port `data/navigation.ts` and `data/games.ts` from react-conversion. Convert games to `data/games.json` so the JS main can `require` it; the TS side imports it with `resolveJsonModule`. Add M27/CFB27 entries.
   - Delete `src/shared/store.ts`.
   - `TableEditorComponent.tsx`: move to `@handsontable/react-wrapper` (`HotTable` plus a `HotTableRef` ref).
   - `utils/monacoLoader.ts`: bundle monaco locally (`self.MonacoEnvironment.getWorker` with `monaco-editor/esm/vs/editor/editor.worker?worker`, then `loader.config({ monaco })`).
   - `index.html` CSP: add `worker-src 'self' blob:`. Check in dev that `@vitejs/plugin-react`'s inline refresh preamble isn't blocked by `script-src 'self'`; if it is, relax the CSP in dev only through a small Vite `transformIndexHtml` plugin.
   - Add `src/renderer/src/api.d.ts`: the `Window.api` typing from the old `src/preload/index.d.ts`, without `window.electron`.
   - Fix the remaining `tsc` errors until `npm run typecheck` is clean.

4. **Preload: add `window.api`** (`preload/franchisePreload.js`)
   - Add a 4th `contextBridge.exposeInMainWorld("api", { general, files, franchise })` that maps onto existing channels: `general.getVersion` → `app:get-version`, `openDialog`/`saveDialog` → `dialog:show-open`/`dialog:show-save` (return the path or null), `files.getRecentFiles`/`removeRecentFile` → `recent-files:get`/`remove`, `files.showItemInFolder` → `welcome:reveal-in-explorer`, `files.openFolder` → the existing openPath handler.
   - New channel `files:get-saves` in a new `main/handlers/filesHandler.js`, registered in `main.js`. Port the logic of the old `src/main/lib/files.ts` to JS (scan `Documents/<game>/settings` from `data/games.json`) and return `GameSaveResponse`.
   - `franchise.*` (initialize, getActive, close, readTableData, exportTableData) is a stub for this pass: `getActiveFranchiseFiles` returns `[]`, the others are TODOs. Wiring it to FranchiseFileManager is the next phase, because the renderer's `FranchiseModel` shape is different from `franchise:get-metadata`.

5. **Main: load the React UI on demand** (`main.js:381`, the `mainWindow.loadFile(homePage)` call)
   - If `MFE_RENDERER_URL` is set, `loadURL` it (Vite dev server). Else if `MFE_UI=react`, `loadFile("out/renderer/index.html")`. Otherwise load v4 as today. The v4 path and e2e tests stay unchanged.

6. **Scripts**
   - `dev:react`: concurrently `vite`, then `wait-on tcp:5173`, then `cross-env NODE_ENV=development MFE_RENDERER_URL=http://localhost:5173 electron .`
   - `build:react` = `vite build`, `start:react` = `cross-env MFE_UI=react electron .`
   - `typecheck` = `tsc -b --noEmit` (or per tsconfig), `test:react` = `vitest run`, `lint` = `eslint src`, `stylelint` = `stylelint "src/**/*.{css,scss}"`, `format` = `prettier --write src`, `storybook`, `build-storybook`.
   - `.githooks/pre-push`: add `npm run lint && npm run test:react`.
   - CI (`.github/actions/build-and-test/action.yml`): add `typecheck`, `test:react` and `build:react` steps. electron-builder keeps packaging v4 until cutover, but `out/renderer/**` goes into `build.files` now.

7. **Docs**: update CLAUDE.md (new commands, the `src/` layout, `window.api`, the handsontable alias, the MFE_UI switch).

## Verification
- `npm install`, `npm run typecheck`, `npm run build:react` (produces `out/renderer/index.html`), `npm run lint`, `npm run stylelint`, `npm run test:react` (RecentFilesList snapshot passes, or is re-recorded if it was only stale), `npm run build-storybook`.
- `npm run dev:react`: the Electron window shows the Welcome page with the version, recent files and the saves list. No CSP errors in devtools; HMR works when a component is edited.
- `npm run build:react && npm run start:react`: the same page loads from `file://`.
- Regression: `npm run test:unit` and `npm run e2eTest`, so v4 still works with the aliased handsontable 11.
- Use the `run` skill to launch the app and screenshot the Welcome page.

## Status (2026-10-24)
Steps 1–7 are done (`0f5951c`, `d8e3f51`). Checked: lint 0 errors / 4 warnings, vitest 3/3, typecheck clean.
Deferred on purpose: `out/renderer/**` is not in `build.files` yet (until cutover).
The remaining Verification items were run in the close-out below.

## Close-out — DONE (2026-10-24, committed in `56d2e8f`)
Result: stylelint clean (auto-fix + `darken` → `color.adjust`, `%link-item`, dropped `#__next`), lint 0 warnings, `build-storybook` OK, `start:react` and `dev:react` show the Welcome page (version, recent files, saves) with no CSP errors, HMR works. Dev-only `mfe:dev-csp` plugin in `vite.config.mts` adds `'unsafe-inline'` to `script-src` for plugin-react's inline preamble. Fixed the `List` key warning and the 4 `react-hooks/exhaustive-deps` warnings. e2e 24/24 (`bulk-edit` 2,500-cell paste had one flaky worker crash 0xC0000005, then passed on rerun). Left as is: Prettier drift in 6 pre-existing TSX/HTML files, React Router v7 future-flag warnings.

Next: [01-franchise-model.md](01-franchise-model.md). Roadmap: [plan.md](plan.md).
