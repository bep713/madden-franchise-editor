import { describe, expect, it, vi } from 'vitest';
import {
    buildContextMenu,
    canEmptyRecords,
    ContextMenuActions,
    recordsToEmpty,
    selectedRecordRange,
    singleSelectedRecord
} from './contextMenu';
import { createOrientation } from './orientation';

const headerNames = ['A', 'B', 'C'];
// Visual row r is physical row r + 10
const rows = {
    toPhysicalRow: (row: number) => row + 10,
    toVisualRow: (row: number) => row - 10
};
const normal = createOrientation(false, headerNames, rows);
const inverted = createOrientation(true, headerNames, rows);

describe('selectedRecordRange', () => {
    it('maps normal rows, in either direction', () => {
        expect(selectedRecordRange([3, 0, 1, 2], normal)).toEqual({
            start: 11,
            end: 13
        });
    });

    it('takes a row header selection as its records', () => {
        expect(selectedRecordRange([2, -1, 2, 2], normal)).toEqual({
            start: 12,
            end: 12
        });
    });

    it('is null for a column header selection or no selection', () => {
        expect(selectedRecordRange([-1, 1, 5, 1], normal)).toBeNull();
        expect(selectedRecordRange(undefined, normal)).toBeNull();
    });

    it('maps inverted columns to records', () => {
        expect(selectedRecordRange([2, 5, 0, 3], inverted)).toEqual({
            start: 2,
            end: 4
        });
        // a column header click is one whole record
        expect(selectedRecordRange([-1, 3, 2, 3], inverted)).toEqual({
            start: 2,
            end: 2
        });
    });

    it('is null when the inverted field-name column is included', () => {
        expect(selectedRecordRange([0, 0, 0, 0], inverted)).toBeNull();
        expect(selectedRecordRange([0, 0, 1, 3], inverted)).toBeNull();
    });
});

describe('singleSelectedRecord', () => {
    it('is the one record, else null', () => {
        expect(singleSelectedRecord([2, 0, 2, 2], normal)).toBe(12);
        expect(singleSelectedRecord([2, 0, 3, 0], normal)).toBeNull();
        expect(singleSelectedRecord([0, 2, 2, 2], inverted)).toBe(1);
        expect(singleSelectedRecord([-1, 0, -1, 0], normal)).toBeNull();
    });
});

describe('recordsToEmpty', () => {
    it('skips records that are already empty', () => {
        expect(recordsToEmpty([0, 0, 3, 0], normal, new Set([11, 12]))).toEqual(
            [10, 13]
        );
        expect(recordsToEmpty([1, 0, 2, 0], normal, new Set([11, 12]))).toEqual(
            []
        );
        expect(recordsToEmpty([-1, 0, 2, 0], normal, new Set())).toEqual([]);
    });
});

describe('canEmptyRecords', () => {
    it.each([
        [{ record1Size: 0 }, false],
        [{ record1Size: 3 }, false],
        [{ record1Size: 4 }, true],
        [{}, false]
    ])('%o → %s', (header, expected) => {
        expect(canEmptyRecords({ header })).toBe(expected);
    });
});

describe('buildContextMenu', () => {
    const makeActions = () => {
        const action = () => ({
            disabled: vi.fn(() => false),
            run: vi.fn()
        });
        return {
            findReferences: action(),
            openReferenceInNewTab: action(),
            setRecordsEmpty: action(),
            setNextRecordToUse: action()
        } satisfies ContextMenuActions;
    };

    it("has v4's keys, labels and order", () => {
        const menu = buildContextMenu(makeActions());
        const items = menu.items as Record<
            string,
            {
                name: string;
                submenu?: { items: { key: string; name: string }[] };
            }
        >;
        expect(Object.keys(items)).toEqual([
            'find_references',
            'open_new_tab',
            'empty_row',
            'advanced'
        ]);
        expect(Object.values(items).map((item) => item.name)).toEqual([
            'Find references to this record...',
            'Open this reference in a new tab',
            'Set selected record(s) as empty',
            'Advanced...'
        ]);
        expect(
            items.advanced.submenu?.items.map(({ key, name }) => ({
                key,
                name
            }))
        ).toEqual([
            {
                key: 'advanced:setNextRecordToUse',
                name: 'Set as next empty record to use'
            }
        ]);
    });

    it('calls the actions from disabled and callback', () => {
        const actions = makeActions();
        const items = buildContextMenu(actions).items as Record<
            string,
            {
                disabled: () => boolean;
                callback: () => void;
                submenu?: {
                    items: { disabled: () => boolean; callback: () => void }[];
                };
            }
        >;
        actions.findReferences.disabled.mockReturnValue(true);
        expect(items.find_references.disabled()).toBe(true);
        expect(items.open_new_tab.disabled()).toBe(false);

        items.find_references.callback();
        items.open_new_tab.callback();
        items.empty_row.callback();
        const next = items.advanced.submenu!.items[0];
        next.disabled();
        next.callback();

        expect(actions.findReferences.run).toHaveBeenCalledTimes(1);
        expect(actions.openReferenceInNewTab.run).toHaveBeenCalledTimes(1);
        expect(actions.setRecordsEmpty.run).toHaveBeenCalledTimes(1);
        expect(actions.setNextRecordToUse.disabled).toHaveBeenCalledTimes(1);
        expect(actions.setNextRecordToUse.run).toHaveBeenCalledTimes(1);
    });
});
