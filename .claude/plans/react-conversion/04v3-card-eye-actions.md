# 04v3: Eye icon and "View loaded schema" link

Index: [04v-schema-viewer.md](04v-schema-viewer.md). Presentational only: new optional props, not passed by the page yet (04v5 wires them). Independent of 04v1 and 04v2 (wave 1).

**Touch only:** `routes/SchemaManagement/components/SchemaCard.tsx`, `SchemaCard.module.css`, `SchemaActionBar.tsx`, `src/renderer/src/assets/icons/eye.svg` (new), and tests for these two components (new `SchemaCard.test.tsx` / `SchemaActionBar.test.tsx` next to them, or extend whatever covers them now). Do **not** edit `SchemaManagement.tsx`.

## Changes

### `assets/icons/eye.svg`
- An outline eye (almond shape + round pupil), drawn like `trash.svg`: read it and copy its `viewBox`, `width`/`height`, `stroke`, `stroke-width`, `fill="none"` and `currentColor` use exactly.

### `SchemaCard`
- New optional props: `onView?: (entry: SchemaEntry) => void` and `viewingPath?: string`.
- When `onView` is set, **every** row (bundled, custom, loaded, the Other card, picking mode) gets an eye button before the existing trash / active / bundled icon:
  - `<button type='button' aria-label={`View ${label}`} title='View fields' data-action='view-schema' className={styles.view} onClick={() => onView(entry)}>`.
  - The eye and the existing icon go in one right-aligned group (a wrapping `<span className={styles.icons}>` with a small gap), so the eyes line up in a column whatever icon follows. The `justifyContent='space-between'` row then has two children: the name and the group.
  - The row whose `entry.path` matches `viewingPath` (use `samePath` from `schemaList.ts`) gets `data-viewing` on the row div and `styles.viewing` on the eye (the accent color the drawer uses for unread, or the existing link color; pick a token from `assets/colors.css`).
- `.view` styles copy `.delete`'s button reset and size. Hover/focus-visible like `.delete`.
- Without `onView`, the card renders exactly as now.

### `SchemaActionBar`
- New optional prop `onViewLoaded?: () => void`. When it is set, the first list item is `<Link data-action='view-loaded-schema' key='view-loaded-schema' onClick={onViewLoaded} text='View loaded schema' />`. Without it, the bar is unchanged (hidden, not disabled, per the decisions).

## Verification
- Vitest:
  - `SchemaCard`: no eyes without `onView`. With `onView`: one eye per row, including a bundled row and the loaded row; clicking calls `onView` with that entry; `aria-label` uses the row label; `data-viewing` only on the `viewingPath` row (path match ignores case and slash direction).
  - `SchemaActionBar`: no "View loaded schema" without `onViewLoaded`; with it, the link is first and calls the handler.
  - Existing `SchemaManagement.test.tsx` and its snapshots, if any, still pass unchanged (the page doesn't pass the new props).
- `npm run typecheck && npm run lint && npm run stylelint && npm run test:react`.
