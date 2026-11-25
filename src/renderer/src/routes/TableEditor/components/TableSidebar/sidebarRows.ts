import { TableListItem } from '@shared/types';

export type SidebarRow =
    | { kind: 'pinnedLabel' }
    | {
          kind: 'table';
          table: TableListItem;
          pinned: boolean;
          section: 'pinned' | 'all';
      }
    | { kind: 'divider' };

/**
 * The Pinned section (label, pinned tables, divider), then the rest of
 * `tables`. `tables` is the filtered list while searching, so the section only
 * holds the pins it contains, and is left out if there are none.
 * Pinned tables move out of the full list, unless the section is hidden.
 */
export function buildSidebarRows(
    tables: TableListItem[],
    pinnedTables: TableListItem[],
    isPinned: (table: TableListItem) => boolean,
    showPinned: boolean
): SidebarRow[] {
    const rows: SidebarRow[] = [];
    const inPinnedSection = new Set<number>();

    if (showPinned) {
        const shownIds = new Set(tables.map((table) => table.id));
        const pinsShown = pinnedTables.filter((table) =>
            shownIds.has(table.id)
        );
        pinsShown.forEach((table) => inPinnedSection.add(table.id));

        if (pinsShown.length > 0) {
            rows.push({ kind: 'pinnedLabel' });
            pinsShown.forEach((table) =>
                rows.push({
                    kind: 'table',
                    table,
                    pinned: true,
                    section: 'pinned'
                })
            );
            rows.push({ kind: 'divider' });
        }
    }

    tables
        .filter((table) => !inPinnedSection.has(table.id))
        .forEach((table) =>
            rows.push({
                kind: 'table',
                table,
                pinned: isPinned(table),
                section: 'all'
            })
        );

    return rows;
}

// A stable react-window key: a pinned table is listed twice
export const rowKey = (row: SidebarRow): string =>
    row.kind === 'table' ? `${row.section}-${row.table.id}` : row.kind;
