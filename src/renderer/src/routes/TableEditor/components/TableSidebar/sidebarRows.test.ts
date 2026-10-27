import { describe, expect, it } from 'vitest';
import { TableListItem } from '@shared/types';
import { buildSidebarRows } from './sidebarRows';

const table = (id: number, name: string): TableListItem => ({
    id,
    uniqueId: id * 10,
    name,
    recordCount: 1,
    isArray: false
});

const A = table(4096, 'A');
const PLAYER = table(4220, 'Player');
const TEAM = table(7388, 'Team');
const ALL = [A, PLAYER, TEAM];
const PINNED = [PLAYER, TEAM];
const isPinned = (t: TableListItem) => PINNED.some((p) => p.id === t.id);

const summary = (rows: ReturnType<typeof buildSidebarRows>) =>
    rows.map((row) =>
        row.kind === 'table'
            ? `${row.section}:${row.table.id}${row.pinned ? '*' : ''}`
            : row.kind
    );

describe('buildSidebarRows', () => {
    it('moves the pinned tables out of the full list into the Pinned section', () => {
        expect(summary(buildSidebarRows(ALL, PINNED, isPinned, true))).toEqual([
            'pinnedLabel',
            'pinned:4220*',
            'pinned:7388*',
            'divider',
            'all:4096'
        ]);
    });

    it('keeps the pinned tables in the full list, flagged, when the section is hidden', () => {
        expect(summary(buildSidebarRows(ALL, PINNED, isPinned, false))).toEqual(
            ['all:4096', 'all:4220*', 'all:7388*']
        );
    });

    it('shows only the pins in the filtered list', () => {
        expect(
            summary(buildSidebarRows([TEAM, A], PINNED, isPinned, true))
        ).toEqual(['pinnedLabel', 'pinned:7388*', 'divider', 'all:4096']);
    });

    it('leaves out the section if the filter matches no pins', () => {
        expect(summary(buildSidebarRows([A], PINNED, isPinned, true))).toEqual([
            'all:4096'
        ]);
    });

    it('leaves out the section if nothing is pinned', () => {
        expect(summary(buildSidebarRows(ALL, [], () => false, true))).toEqual([
            'all:4096',
            'all:4220',
            'all:7388'
        ]);
    });
});
