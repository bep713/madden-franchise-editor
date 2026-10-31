import { describe, expect, it } from 'vitest';
import type {
    EmptyState,
    WriteBulkTableCellsResult,
    WrittenRecord
} from '@shared/types/franchise';
import {
    IGNORED_CHANGE_SOURCES,
    REDO_SOURCE,
    UNDO_SOURCE,
    dropNoopChanges,
    getEmptyRecordRowEdits,
    getRowEdits,
    planWriteResult,
    toCellWrites,
    type CellChange,
    type RecordChange,
    type WritableTable,
    type WriteState
} from './cellWrites';

const headers = [
    { name: 'A', offset: 0 },
    { name: 'B', offset: 32 },
    { name: 'C', offset: 31 }
];

function makeTable(): WritableTable {
    return {
        tableId: 7,
        headers,
        records: [
            { A: 1, B: 2, C: 3 },
            { A: 4, B: 5, C: 6 }
        ],
        recordMeta: [
            { index: 0, isEmpty: false },
            { index: 1, isEmpty: true }
        ],
        emptyRecordIndices: [1]
    };
}

const makeState = (): WriteState => ({
    cellErrors: {},
    emptyRecordIndices: new Set([1])
});

const written = (overrides: Partial<WrittenRecord> = {}): WrittenRecord => ({
    tableId: 7,
    recordIndex: 0,
    record: { A: 9, B: 2, C: 3 },
    recordMeta: { index: 0, isEmpty: false },
    previousRecordMeta: { index: 0, isEmpty: false },
    cellErrors: null,
    ...overrides
});

const ok = (
    extra: Partial<Extract<WriteBulkTableCellsResult, { success: true }>> = {}
): WriteBulkTableCellsResult => ({
    success: true,
    results: [],
    records: [],
    emptyStates: [],
    ...extra
});

const change = (
    recordIndex: number,
    fieldIndex: number,
    oldValue: unknown,
    newValue: unknown
): RecordChange => ({
    cell: { recordIndex, fieldIndex },
    fieldName: headers[fieldIndex].name,
    oldValue,
    newValue
});

const changes: RecordChange[] = [change(3, 0, 1, 10), change(4, 1, 'x', 'y')];

describe('IGNORED_CHANGE_SOURCES', () => {
    it('covers v4 and Handsontable 16 data-load sources', () => {
        for (const s of [
            'onEmpty',
            'cell-write-revert',
            'loadData',
            'updateData',
            'updateSettings'
        ]) {
            expect(IGNORED_CHANGE_SOURCES.has(s)).toBe(true);
        }
        expect(IGNORED_CHANGE_SOURCES.has('edit')).toBe(false);
        expect(IGNORED_CHANGE_SOURCES.has('CopyPaste.paste')).toBe(false);
        // Undo/redo replays are written like user edits
        expect(IGNORED_CHANGE_SOURCES.has(UNDO_SOURCE)).toBe(false);
        expect(IGNORED_CHANGE_SOURCES.has(REDO_SOURCE)).toBe(false);
    });
});

describe('dropNoopChanges', () => {
    it('nulls no-ops in place and counts the rest', () => {
        const list: (CellChange | null)[] = [
            [0, 'A', 1, 1],
            [1, 'A', 1, 2],
            null
        ];
        expect(dropNoopChanges(list)).toBe(1);
        expect(list).toEqual([null, [1, 'A', 1, 2], null]);
    });

    it('returns 0 when everything is a no-op', () => {
        expect(dropNoopChanges([[0, 'A', 'x', 'x']])).toBe(0);
    });
});

describe('toCellWrites', () => {
    it('writes the new value to each record and field', () => {
        expect(toCellWrites(changes, 7)).toEqual([
            { tableId: 7, recordIndex: 3, fieldName: 'A', value: 10 },
            { tableId: 7, recordIndex: 4, fieldName: 'B', value: 'y' }
        ]);
    });
});

describe('getRowEdits / getEmptyRecordRowEdits', () => {
    const record = { A: 1, B: 2, C: 3 };

    it('returns an edit per header', () => {
        expect(getRowEdits(headers, 5, record)).toEqual([
            [5, 'A', 1],
            [5, 'B', 2],
            [5, 'C', 3]
        ]);
    });

    it('only includes fields with offset < 32 for empty records', () => {
        expect(getEmptyRecordRowEdits(headers, 5, record)).toEqual([
            [5, 'A', 1],
            [5, 'C', 3]
        ]);
    });
});

describe('planWriteResult', () => {
    it('reverts everything when the whole write failed', () => {
        const table = makeTable();
        const state = makeState();
        const plan = planWriteResult(
            table,
            changes,
            { success: false, error: 'boom' },
            state
        );
        expect(plan.reverts).toEqual([
            [3, 'A', 1],
            [4, 'B', 'x']
        ]);
        expect(plan.failedChanges).toEqual([0, 1]);
        expect(plan.sourceEdits).toEqual([]);
        expect(table).toEqual(makeTable());
        expect(state).toEqual(makeState());
    });

    it('reverts only failed entries', () => {
        const plan = planWriteResult(
            makeTable(),
            changes,
            ok({
                results: [
                    { success: true, index: 0 },
                    { success: false, index: 1, error: 'bad' }
                ]
            }),
            makeState()
        );
        // record space: [recordIndex, fieldName, oldValue]
        expect(plan.reverts).toEqual([[4, 'B', 'x']]);
        expect(plan.failedChanges).toEqual([1]);
    });

    it('merges records in place and updates recordMeta', () => {
        const table = makeTable();
        const row = table.records[0];
        const plan = planWriteResult(
            table,
            changes,
            ok({ records: [written()] }),
            makeState()
        );
        expect(table.records[0]).toBe(row);
        expect(row).toEqual({ A: 9, B: 2, C: 3 });
        expect(plan.sourceEdits).toEqual([]);
    });

    it('sets and clears cellErrors', () => {
        const table = makeTable();
        const state = makeState();
        planWriteResult(
            table,
            changes,
            ok({ records: [written({ cellErrors: { A: 'bad value' } })] }),
            state
        );
        expect(state.cellErrors).toEqual({ 0: { A: 'bad value' } });
        planWriteResult(table, changes, ok({ records: [written()] }), state);
        expect(state.cellErrors).toEqual({});
    });

    it('re-syncs the full row of an un-emptied record', () => {
        const table = makeTable();
        const plan = planWriteResult(
            table,
            changes,
            ok({
                records: [
                    written({
                        recordIndex: 1,
                        record: { A: 7, B: 8, C: 9 },
                        recordMeta: { index: 1, isEmpty: false },
                        previousRecordMeta: { index: 1, isEmpty: true }
                    })
                ]
            }),
            makeState()
        );
        expect(plan.sourceEdits).toEqual([
            [1, 'A', 7],
            [1, 'B', 8],
            [1, 'C', 9]
        ]);
        expect(table.recordMeta[1]).toEqual({ index: 1, isEmpty: false });
    });

    it('applies empty state, keeping the same Set and only offset < 32 fields', () => {
        const table = makeTable();
        const state = makeState();
        const set = state.emptyRecordIndices;
        const emptyState: EmptyState = {
            tableId: 7,
            emptyRecordIndices: [0, 1],
            emptyRecords: [{ index: 0, record: { A: 0, B: 0, C: 0 } }]
        };
        const plan = planWriteResult(
            table,
            changes,
            ok({ emptyStates: [emptyState] }),
            state
        );
        expect(table.emptyRecordIndices).toEqual([0, 1]);
        expect(state.emptyRecordIndices).toBe(set);
        expect([...set]).toEqual([0, 1]);
        expect(plan.sourceEdits).toEqual([
            [0, 'A', 0],
            [0, 'C', 0]
        ]);
    });

    it('ignores rows and empty states of other tables', () => {
        const table = makeTable();
        const state = makeState();
        const plan = planWriteResult(
            table,
            changes,
            ok({
                records: [written({ tableId: 99, cellErrors: { A: 'x' } })],
                emptyStates: [
                    { tableId: 99, emptyRecordIndices: [5], emptyRecords: [] }
                ]
            }),
            state
        );
        expect(table).toEqual(makeTable());
        expect(state).toEqual(makeState());
        expect(plan).toEqual({
            reverts: [],
            failedChanges: [],
            sourceEdits: []
        });
    });

    it('syncs only the fields main changed when syncChangedFields is set', () => {
        const table = makeTable();
        const plan = planWriteResult(
            table,
            changes,
            ok({
                records: [
                    written({ record: { A: 9, B: 2, C: 30 } }),
                    // another table: never synced
                    written({ tableId: 99, record: { A: 0, B: 0, C: 0 } })
                ]
            }),
            makeState(),
            { syncChangedFields: true }
        );
        expect(plan.sourceEdits).toEqual([
            [0, 'A', 9],
            [0, 'C', 30]
        ]);
        expect(table.records[0]).toEqual({ A: 9, B: 2, C: 30 });
    });

    it('syncs no fields without syncChangedFields', () => {
        const plan = planWriteResult(
            makeTable(),
            changes,
            ok({ records: [written({ record: { A: 9, B: 2, C: 30 } })] }),
            makeState()
        );
        expect(plan.sourceEdits).toEqual([]);
    });
});
