# Madden Franchise Editor verification map

This is the maintained source for verifying Madden Franchise Editor's user-facing behavior in the v5 React UI. Read this index, then use the matching feature file as the recipe. The harness is `drive.js` in this skill. See `../SKILL.md` for build, doctor, the scenario `ctx`, evidence and cleanup.

## Baseline preconditions

- `node .claude/skills/verify-mfe/scripts/doctor.js` prints `READY`. In particular the React build is fresh.
- Every run goes through `drive.js`. It gives the run a fresh userData dir (first-run pages, update and schema checks, and auto-save all off) and a sandbox copy of the M22 career file at `ctx.sandbox.careerPath` (basename `CAREER-E2ETEST`).
- The scenario starts on the Welcome page with no file open (the `main window ready` log line).
- Fixture facts that recipes rely on:
  - Team table `7482` row 52 has `LongName` = `New York`.
  - The first table the editor loads is `4096`, which is unnamed.
  - The schedule is SeasonGame `4146`, with 28 weeks; `P1` is selected first and week `1` has 16 games.
  - The bundled schema is `M22 v329.1`.

## Driving conventions

- Use the page models in `ctx.models` (from `tests/e2e/models/react/`). They wrap the stable handles: roles, text, and `data-*` attributes. Never select on CSS-module class names.
- Stub every native dialog with `ctx.stubs` immediately before the click that opens it.
- Perform the action through the UI or the app menu (`app.clickMenuItem(id)`). Use IPC reads (`app.readTable`) only to look up state.
- Wait with `poll` or `locator.waitFor()`, never with fixed sleeps or `expect(locator)`.

## Proof and skip reporting

- Take a `shot()` before and after each user action that changes state.
- When a feature writes a file, prove it with `readSavedTable` on the sandbox file, or with `keep()` plus a comparison for exports.
- Record the feature file and sub-feature ID in `log()` lines. For example: `log("table-editor/edit-cell")`.
- If an entry point can't be reached, report it with the attempted step and the unmet precondition. Don't claim it as verified through a different entry point.

## Feature entry contract

Each feature file has an H1 title and a one-paragraph description, then four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with drive.js`, `Gotchas`.

## Features

- [Open a file](./open-file.md): opening a franchise file from the Welcome page, Recent Files, and closing it.
- [Table editor](./table-editor.md): browsing tables, editing cells, saving, pins, and jumping to a column. **Proven:** `scenarios/table-edit-save.js`.
- [Export and import](./export-import.md): Excel, raw-table and FRT export, and Excel/raw import.
- [Schedule editor](./schedule-editor.md): weeks, game edits, the Default/Table views, and "View in table editor".
- [Schemas](./schemas.md): the Schemas page and the schema viewer's filters.
