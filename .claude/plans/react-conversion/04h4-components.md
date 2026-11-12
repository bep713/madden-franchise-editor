# 04h4: Schedule components

Index: [04h-schedule.md](04h-schedule.md). Needs 04h2's types only. Presentational: props in, callbacks out, no IPC.

**Touch:** under `src/renderer/src/routes/Schedule/components/`: `WeekBar/`, `GameRow/`, `TeamSelect/`, `TimeInput/` (each `.tsx` + `.module.css` + `.test.tsx`), `src/renderer/src/routes/Schedule/teamLogos.ts` (new), `src/renderer/src/assets/icons/table.svg` (new, if no existing icon fits; check `jump.svg` first).

## `teamLogos.ts`
- `import.meta.glob('../../../../../renderer/img/team-logos/nfl/*.PNG', { eager: true, query: '?url', import: 'default' })` builds a map from lowercased file name to URL. `logoUrl(team): string | undefined` takes the file name from `team.logoPath` (`img/team-logos/nfl/cardinals.PNG`).
- Custom teams get no URL and render a neutral placeholder: the abbreviation in a circle, styled in CSS. v4 used a 1px base64 PNG.
- Check that `vite build` emits them under `out/renderer/assets`, and that the dev server can serve a path outside `src/renderer`. Vite's default `server.fs.allow` is the workspace root, which includes `renderer/`. If not, add `renderer/img` to `server.fs.allow` in `vite.config.mts`.
- **Done as:** nothing imports `teamLogos.ts` until 04h5, so `vite build` tree-shakes the logos. Check `out/renderer/assets` for the team PNGs in 04h5.
- vitest: `import.meta.glob` works under Vitest. Assert that `logoUrl` returns a string for `cardinals.PNG` and `undefined` for a custom team.

## `WeekBar`
- Props: `weeks: ScheduleWeek[]`, `counts: number[]`, `selected: number`, `onSelect(index)`.
- One `<button>` per week in order, all 28 (v4 parity), with `aria-pressed` on the selected one, `data-week={index}`, and the week abbreviation as text (`P1` … `SB`, `N/A`). `title={week.weekName}`.
- Improvement 4: a small count badge (`data-count`). Hide it when the count is 0.
- The row scrolls horizontally when it doesn't fit, and the selected button is scrolled into view on change.
- Arrow keys Left/Right move the selection (roving `tabIndex`).

## `TeamSelect`
- Props: `teams: ScheduleTeam[]`, `value: ScheduleTeam`, `onChange(team)`, `label` (`"Away team"` / `"Home team"`, used as `aria-label`).
- The logo (or placeholder) plus the shared `Dropdown` (native `<select>`, which has type-ahead), with option text = abbreviation and value = `team.key`. Native rather than `Autocomplete`: with 32–36 options, type-ahead is enough, and e2e can use `selectOption`.

## `TimeInput`
- Props: `minutes: number`, `onChange(minutes)`, `aria-label`.
- A text input showing `formatTime12(minutes)`. On Enter or blur it parses with `parseTime12`. Valid and different → `onChange`. Invalid → error state (`aria-invalid`, the `BaseFormInput` error style), and the value goes back to the last good value on blur. Escape reverts.
- When the `minutes` prop changes (re-read), the text resets unless the input is focused and the user has typed in it.

## `GameRow`
- Props: `game`, `teams`, `days`, `onEdit(edit: GameEdit)`, `onViewInTable()`.
- Layout (v4 order): away `TeamSelect` · "@" · home `TeamSelect` · day `Dropdown` (abbreviations) · `TimeInput` · score/played · view button.
- `data-record-index={game.recordIndex}` on the row. `onContextMenu` opens a one-item menu, "View in table editor", at the pointer, and closes it on outside click or Escape. Check whether a small menu component already exists before writing one. If none does, keep it local to `GameRow`.
  - **Done as:** only `HistoryMenu` exists (table-editor specific), so `GameRow` has a local `RowMenu` (portal + underlay, `data-action='view-in-table'`). The view button reuses `jump.svg`.
- Played: `"Final 24–17"` (away–home, matching the column order), with `data-played`. The inputs stay enabled.
- Improvement 1: an icon button with `aria-label="View in table editor"`.
- `day` is missing (an unknown enum value): the dropdown shows an empty first option until the user picks a day.

## Verification
- vitest per component:
  - WeekBar: 28 buttons, the click calls `onSelect`, `aria-pressed`, badge hidden at 0, arrow keys.
  - TeamSelect: changing the option calls `onChange` with the team object, and the placeholder shows for a custom team.
  - TimeInput: valid entry, invalid entry and revert, Escape, prop change.
  - GameRow: each control calls `onEdit` with the right `GameEdit`, the played text, the context menu item, and the view button.
- Storybook stories (`doc/*.stories.jsx`) for `GameRow` and `WeekBar`, if the other route components have them. Check `routes/TableEditor/components/*/doc` and match.
  - **Done as:** no stories. No route component has any.
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`.
