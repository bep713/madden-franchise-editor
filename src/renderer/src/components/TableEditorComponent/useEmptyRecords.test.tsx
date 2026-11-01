import type { RefObject } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotTableRef } from '@handsontable/react-wrapper';
import type { TableData } from '@shared/types';
import type { WriteState } from '@renderer/utils/cellWrites';
import { createOrientation, type GridOrientation } from './orientation';
import type { CellWriteContext } from './useCellWrites';
import useEmptyRecords from './useEmptyRecords';

const headers = [
    { name: 'A', offset: 0 },
    { name: 'B', offset: 16 },
    { name: 'C', offset: 32 }
];

const franchiseAPI = { setTableRecordsEmpty: vi.fn() };
const electronAPI = { showMessageBox: vi.fn(async () => ({})) };

function setup() {
    const table = {
        tableId: 7,
        headers,
        records: [
            { A: 1, B: 2, C: 'x' },
            { A: 3, B: 4, C: 'y' },
            { A: 5, B: 6, C: 'z' }
        ],
        recordMeta: [{}, {}, {}],
        emptyRecordIndices: []
    } as unknown as TableData;
    const context: CellWriteContext = {
        fileId: 'file',
        table,
        setLoaderOptions: vi.fn()
    };
    const hot = {
        isDestroyed: false,
        setSourceDataAtCell: vi.fn(),
        render: vi.fn()
    };
    const hotRef = {
        current: { hotInstance: hot }
    } as unknown as RefObject<HotTableRef>;
    const stateRef = {
        current: {
            cellErrors: {},
            emptyRecordIndices: new Set<number>()
        } as WriteState
    };
    const orientationRef: { current: GridOrientation } = {
        current: createOrientation(
            false,
            headers.map((h) => h.name),
            { toPhysicalRow: (r) => r, toVisualRow: (r) => r }
        )
    };
    const undo = { recordEmpty: vi.fn() };
    const hook = renderHook(() =>
        useEmptyRecords(hotRef, () => context, stateRef, orientationRef, undo)
    );
    return { table, hot, undo, hook };
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { franchiseAPI, electronAPI });
});

describe('useEmptyRecords', () => {
    it('records the first-4-byte fields from before the change', async () => {
        franchiseAPI.setTableRecordsEmpty.mockResolvedValue({
            success: true,
            affectedCount: 1,
            emptyRecordIndices: [1],
            emptyRecords: [{ index: 1, record: { A: 21, B: 0, C: 'y' } }]
        });
        const { table, hot, undo, hook } = setup();

        await expect(hook.result.current.setRecordsEmpty([1])).resolves.toBe(
            true
        );

        // applyEmptyState overwrote the record
        expect(table.records[1]).toEqual({ A: 21, B: 0, C: 'y' });
        expect(hot.setSourceDataAtCell).toHaveBeenCalled();
        expect(undo.recordEmpty).toHaveBeenCalledWith(
            [1],
            [
                {
                    cell: { recordIndex: 1, fieldIndex: 0 },
                    fieldName: 'A',
                    oldValue: 3,
                    newValue: 21
                },
                {
                    cell: { recordIndex: 1, fieldIndex: 1 },
                    fieldName: 'B',
                    oldValue: 4,
                    newValue: 0
                }
            ]
        );
    });

    it('records nothing for a redo', async () => {
        franchiseAPI.setTableRecordsEmpty.mockResolvedValue({
            success: true,
            affectedCount: 1,
            emptyRecordIndices: [1],
            emptyRecords: [{ index: 1, record: { A: 21, B: 0, C: 'y' } }]
        });
        const { undo, hook } = setup();
        await expect(
            hook.result.current.setRecordsEmpty([1], { record: false })
        ).resolves.toBe(true);
        expect(undo.recordEmpty).not.toHaveBeenCalled();
    });

    it('records nothing on an error', async () => {
        franchiseAPI.setTableRecordsEmpty.mockResolvedValue({
            error: 'nope'
        });
        const { table, undo, hook } = setup();
        await expect(hook.result.current.setRecordsEmpty([1])).resolves.toBe(
            false
        );
        expect(electronAPI.showMessageBox).toHaveBeenCalled();
        expect(undo.recordEmpty).not.toHaveBeenCalled();
        expect(table.records[1]).toEqual({ A: 3, B: 4, C: 'y' });
    });
});
