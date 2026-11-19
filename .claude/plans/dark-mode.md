# Dark mode (v5)

## Goal

On the v5 interface, users pick a theme in Settings: **Auto** (default, follows Windows), **Light** or **Dark**. Everything the user sees while on v5 follows it:
- every v5 page;
- the Settings, Schema Manager and Credits windows (v4 pages shared by both UIs);
- the native title bar and menu bar;
- native context menus and dialogs.

On v4 nothing changes. The Theme setting is hidden, and the app looks and behaves exactly as it does today.

## Evidence the design rests on

- **The title bar follows `nativeTheme.themeSource`.** Measured with a scratch Electron 41.0.3 script on this machine (Windows 10 19045), capturing screen pixels. Setting `themeSource = "dark"` turned the OS title bar and the menu bar dark. `"light"` turned them back, live, with no window recreation. A window created afterwards opened dark. Screenshots: `screen-dark.png`, `screen-light.png` and `screen-dark-newwin.png` in the session scratchpad `titlebar-probe/`.
- **`themeSource` alone doesn't restyle a page.** In the same run the page content stayed white under `"dark"`. A page changes only if its CSS opts in through `color-scheme` or `prefers-color-scheme`.
- **No v4 asset opts in.** `rg "prefers-color-scheme|color-scheme"` over `renderer/sass`, `renderer/*.html`, `renderer/js/libs` (Selectr, vanilla-jsoneditor) and `node_modules/handsontable-v11` finds nothing. So the v4 pages are unaffected by `themeSource`, and the v4 *chrome* is protected by only setting it while v5 is the active UI.

## Core design: main owns the theme, gated on the active UI

```
effective UI (currentUi in main.js) + general.theme
   → themeSourceFor(ui, theme)  = ui === "v5" ? theme : "system"
   → nativeTheme.themeSource    → title bar, menu bar, dialogs, prefers-color-scheme in every window
```

- **Under v4 the result is `"system"`.** That is Electron's default, which is what v4 runs with today. So the v4 chrome is unchanged, including today's behaviour of a dark title bar when Windows itself is dark.
- **Under v5 it is the user's choice.** `"system"` gives Auto with no extra code.
- **v5 pages need no theme code in the renderer.** Their CSS keys off `prefers-color-scheme`, which `themeSource` drives. There's no preference read, no IPC and no React context. The one exception is the two widgets that take a theme name in JS (Monaco, and the Handsontable `-dark-auto` class does it in CSS).
- **The shared v4 windows get dark styles only under v5.** Main injects a dark stylesheet with `webContents.insertCSS` into the Settings, Schema Manager and Credits windows while v5 is active, and removes it (`removeInsertedCSS`) on a switch to v4. Every rule sits inside `@media (prefers-color-scheme: dark)`, so Light (and Auto on a light Windows) looks exactly like today. No file under `renderer/` changes.

Rejected:
- **Porting Settings and Schema Manager to React.** It gives the best result, but it's a separate project (Settings has the first-run wizard and the game-directory pages). Injection gets the same look for a fraction of the work. A later port deletes the injected stylesheet.
- **A renderer-applied `color-scheme` in v5 only (the previous revision).** It can't reach the title bar or the shared windows.

## Data shape

```ts
type ThemePreference = 'system' | 'light' | 'dark';   // general.theme, values match nativeTheme.themeSource
type UiVersion = 'v5' | 'v4';                          // currentUi in main.js (already exists)
```

`main/utils/theme.js`, pure and unit-tested:
- `parseThemePreference(value): ThemePreference` turns unknown values into `"system"`. It guards hand-edited preference files.
- `themeSourceFor(ui, theme): ThemePreference`.
- `windowBackground(ui, dark: boolean): string`. Dark surface colour under v5 + dark, else `"#FFFFFF"` (Electron's default, so v4 is unchanged).

Colour tokens are one shared file with one declaration per token holding both values (`--surface: light-dark(#fff, #1e1e1e);`):
- **`data/theme-colors.css`.** v5 imports it (`@data` alias), and main injects it into the shared windows. One source for both, packaged by the existing `data/**/*` rule in `build.files`.

## Step 1. Preference, hidden on v4

- `data/preferencesSchema.json`, in `general.fields` after `uiVersion`:
  `{ "key": "theme", "label": "Theme (new interface)", "type": "dropdown", "defaultValue": "system", "ui": "v5", "options": [{ "label": "Auto (match Windows)", "value": "system" }, { "label": "Light", "value": "light" }, { "label": "Dark", "value": "dark" }], "help": "Auto follows your Windows light/dark setting." }`
- `main/handlers/preferencesHandler.js`:
  - `buildPreferenceSections()` drops fields whose `ui` isn't the active UI. The active UI comes in through `registerPreferencesHandlers`, as a `getActiveUi` getter next to the existing `getLoggedMain`.
  - The Settings window calls `getSections()` each time it renders a page (`settingsManagerUtil.js:64`), so this needs no change in `renderer/`.
- The label says "(new interface)" as well, because a Settings window that is already open when the UI switches keeps the field until it re-renders (Step 2 reloads it if hidden).
- Unit: the sections for v4 lack `theme` and the sections for v5 contain it. A `preferences.json` without `theme` gets `"system"` merged in (`tests/unit/preferences.test.js`).

## Step 2. Theme controller in main

- New `main/utils/theme.js` (functions above).
- New `main/services/themeController.js`, about 60 lines, one module that owns all theme side effects:
  - `apply()`:
    - Sets `nativeTheme.themeSource = themeSourceFor(currentUi, theme)`.
    - For each live main, settings, schema or credits window, calls `setBackgroundColor(windowBackground(...))`.
    - For each shared window, syncs the injected CSS. It inserts when v5 and not yet inserted, and removes when v4. Keys are kept per `webContents`.
  - It calls `apply()`:
    - at startup, after `currentUi` is resolved and before the first window loads;
    - on `onPreferenceChange("general.theme")`;
    - on every UI switch (`switchMainUi`, `loadMainUi`), using the *effective* UI. That covers `MFE_UI`, `MFE_RENDERER_URL` and the fallback to v4 when `out/renderer` is missing;
    - on `nativeTheme` `updated` (Auto + a Windows change), to fix background colours.
  - On each shared window's `did-finish-load`, it re-inserts the CSS, which navigation and reload drop.
  - On a UI switch it reloads the Settings window if it is hidden, so the `theme` field appears or disappears. A visible Settings window is left alone so the user's page isn't reset.
- `main.js`:
  - Construct the controller.
  - Pass `backgroundColor: windowBackground(...)` to the four `BrowserWindow` creations (main.js:369, 470, 798, 1023, 1068) so a dark window doesn't flash white.
  - Register windows with the controller as they are created.
- `main/theme/shared-windows.css` holds the dark overrides for the v4 markup in those windows, all inside `@media (prefers-color-scheme: dark)` and using the tokens. It covers:
  - `body`, `.container`, text, links, inputs, dropdowns and checkboxes;
  - `.settings-manager` pages (incl. first-run wizard and game directories);
  - `.schema-manager-wrapper`, `.schema-list-wrapper`, `.action-button`, `.loader-wrapper`, the notification banners (`.notification-wrapper--green/--red`);
  - the Credits page.

  The source partials are `_framework`, `_settings-manager`, `_schema-manager` and `_notification`, about 30 colour literals between them. That count is inferred from the `rg` totals, so the screenshot pass confirms coverage. The file starts with `:root { color-scheme: light dark; }` so native controls and scrollbars follow too.
- Unit (`tests/unit/theme.test.js`): `parseThemePreference`, `themeSourceFor` for all 6 (ui × theme) pairs, `windowBackground`.

## Step 3. v5 tokens (`src/renderer/src/assets/`)

- Move the semantic tokens from `colors.css` to `data/theme-colors.css` and rewrite them with `light-dark()`: `--text-primary`, `--text-secondary`, `--text-link`, `--divider-color`, `--secondary`, `--disabled`, `--error`, `--info`, `--banner-*`. Add `--surface`, `--surface-raised`, `--surface-sunken`, `--border`, `--hover`, `--selected`, `--focus-ring`, `--overlay` and `--primary-soft`. `colors.css` keeps the raw palette names and imports the token file. Set `:root { color-scheme: light dark; }`.
- Check brand orange contrast on the dark surface. Add a lighter dark value for `--primary` if text-on-orange or orange-on-dark fails 4.5:1.
- `vars.scss`: delete the colour Sass variables (`$brand-*`, `$success-primary`, `$error-primary`, `$button-orange*`, `$background-color`, `$welcome-*`). They are fixed at build time. Their 12 call sites move to tokens, and `%link-item` hover uses `color-mix()`.
- `main.scss`: `body { background: var(--surface); color: var(--text-primary); }`; `.btn` uses tokens.

## Step 4. v5 sweep (`src/renderer/src/`)

- Replace every colour literal outside the token files. That's about 100 in 36 files (`rg` count of hex, `rgb(a)` and named colours). Heaviest: `ScheduleEditor.module.scss` 8, `SchemaFilesCard.module.css` 8, `TableEditor.module.scss` 7, `ViewSwitch.module.css` 6, `Loader.module.css` 6, `Banner.module.css` 6, `Welcome.module.css` 5, `SchemaViewer.module.css` 5, `NavigationTab.module.scss` 5.
- Inline `color: 'black'` in `FieldEditorActionBar.tsx` and `ExpressionEditorActionBar.tsx` → `var(--text-primary)`.
- SVG UI icons in `assets/icons` use `currentColor`. Game logos stay as is.
- **Handsontable 16**: `themeName='ht-theme-main-dark-auto'` (`TableEditorComponent.tsx:752`). The class ships in the installed `ht-theme-main.min.css` (checked) and follows `prefers-color-scheme`. Make the overrides in `TableEditorComponent.module.css` match it and use tokens. That includes the reference cells, empty-row styling and changed-cell highlight.
- **Monaco**: `useColorScheme()` hook (`hooks/useColorScheme.ts`, `matchMedia('(prefers-color-scheme: dark)')` + change listener) → `theme='vs' | 'vs-dark'` in `TextEditor.tsx`.
- **Stylelint guard**: `color-no-hex`, `color-named: "never"` and `function-disallowed-list: ["rgb","rgba","hsl","hsla"]`, allowed only in the token and palette files. A new literal on any v5 page then fails `npm run stylelint` (CI and pre-push).

## Step 5. Verification

**vitest.** `useColorScheme` flips on a media change. `TextEditor` gets `vs-dark` under a dark media mock.

**Playwright forces `prefers-color-scheme: light`.** Measured in the 2026-11-17 prototype: with `themeSource = "dark"`, `matchMedia("(prefers-color-scheme: dark)")` is `false` in a Playwright-launched window until `page.emulateMedia({ colorScheme: "no-override" })`. After that it follows `themeSource` live in both directions. Every theme spec (and `verify-mfe` scenario) must call it on each window it checks, or every dark assertion fails.

**e2e (React project). New `tests/e2e/scripts/react/theme.spec.js`:**
1. `ui: "react"`, theme `dark` seeded:
   - `electronApp.evaluate(({ nativeTheme }) => [nativeTheme.themeSource, nativeTheme.shouldUseDarkColors])` is `["dark", true]`. Per the probe, that is what drives the title bar, which the DOM can't show.
   - The main window body background is the dark surface.
2. Same launch, open Settings and Schema Manager. Both bodies have a dark background, and Settings shows the Theme dropdown.
3. On Settings, choose Light. `themeSource` becomes `"light"`, the main window flips without reload, and `preferences.json` has `general.theme: "light"`. Extend `tests/e2e/models/SettingsManager.js` with `setTheme()`.
4. Default launch, no seed: `themeSource === "system"`.
5. Open a table in Dark. The grid root has `ht-theme-main-dark-auto` and a cell's computed background is dark.
6. **v4 is untouched.** With `ui: "v4"` and theme `dark` seeded:
   - `themeSource === "system"`;
   - the Settings window shows no Theme dropdown;
   - the Settings body background equals today's light value.

   Then switch v5 → v4 through View → Interface with theme `dark`. `themeSource` returns to `"system"`, and the injected CSS is gone (Settings background is light again).

The `v4` e2e project must pass unchanged.

**Visual sweep.** Script it with the `verify-mfe` skill. Take Light and Dark screenshots of:
- every v5 route: Welcome, Table Editor with a table plus the reference, blob and references modals, Schedule, Schema Management, Schema Viewer, Add Schema;
- the Settings window pages (general, game directories, first-run wizard), Schema Manager and Credits;
- each with a full-screen capture so the title bar is in the shot.

Review the set for unreadable text, white boxes and invisible borders, and keep the script so a reviewer can rerun it. Manual check: on Auto, switch Windows to dark and confirm the app follows live.

## Ordering and commits

1. Steps 1–2 (preference, controller, shared-window CSS skeleton, unit tests). Shippable alone, but don't release before Step 4. A Dark v5 user would get a dark title bar over light pages.
2. Step 3 (tokens).
3. Step 4 (sweep, widgets, stylelint guard) + `theme.spec.js`.
4. Fill in `shared-windows.css` from the screenshot pass, then tune the palette.

Each commit runs `npm run typecheck && npm run lint && npm run stylelint && npm run test:react && npm run test:unit`. Commits 3 and 4 also run `npm run e2eTest` (both projects).

## Throughput checkpoint

- **Blocking first steps.** Step 3's token names are the contract for the v5 sweep and `shared-windows.css`.
- **Independent workstreams.** After Step 3, run in parallel: (a) main controller + shared-window CSS, (b) the v5 sweep, split by folder (`components/`, `routes/TableEditor`, `routes/Schedule`, the remaining routes).
- **Shared mutable state.** Only `data/theme-colors.css`. Freeze it after Step 3. A worker that needs a new token reports it instead of editing.
- **Smallest safe decomposition.** One worker for Steps 1–3, then main/shared-windows and the v5 sweep in parallel.

## Why not theme v4 too

It isn't easier. The v5-only gate costs one ternary (`themeSourceFor`), the CSS insert and remove, and a field filter, about 30 lines in main. Theming v4 would mean:
- sweeping about 115 colour literals in 25 `renderer/sass` partials;
- dark overrides for Handsontable 11 (no theme support), Selectr and the JSON editor;
- the legacy editors (ability, league, offset, hex view);
- v4 e2e coverage.

## Open decisions

- **Dark palette values.** The starting point is neutral greys (surface ~#1e1e1e, raised ~#2a2a2a, text ~#e6e6e6) with brand orange kept. The final values come from the screenshot pass.
  - Prototype (2026-11-17, `test/verify-evidence/dark-proto/`) favours neutral over a blue-slate tint. Slate barely differs and clashes with the Handsontable dark grid and the Windows title bar, which are both neutral.
  - Text on the orange header must be dark, not white. White on `#f80` is about 2.3:1.
  - The pale-orange "selected/sidebar" fills (`--antique-white`) turn muddy brown under a mechanical remap. Give them a neutral raised surface plus an orange accent, not a darkened orange.
  - SVG icons with a fixed dark fill vanish (sidebar icons, schedule chevrons). Confirms the `currentColor` sweep in Step 4.
  - `ht-theme-main-dark` is near-black, darker than the page surface, and its reference-link blue is low contrast. Either set the HT theme's surface variables to the tokens or pick the page surface to match.
  - Dark team logos (CAR, MIN, WAS) lose contrast on dark cards. Needs a decision: a light chip behind logos, or accept it.
