import type {
    CellWrite,
    RecordMeta,
    TableColumn,
    WriteBulkTableCellsResult
} from '@shared/types/franchise';

export type CellChange = [
    row: number,
    prop: string | number,
    oldValue: unknown,
    newValue: unknown
];
export type SourceEdit = [row: number, prop: string, value: unknown];

// Sources of our own sync edits and of data loads (HOT 16 core.js); none are user edits.
export const IGNORED_CHANGE_SOURCES: ReadonlySet<string> = new Set([
    'onEmpty',
    'cell-write-revert',
    'loadData',
    'updateData',
    'updateSettings'
]);

export interface WriteState {
    cellErrors: Record<number, Record<string, string>>;
    emptyRecordIndices: Set<number>;
}

export interface WritableTable {
    tableId: number;
    headers: Pick<TableColumn, 'name' | 'offset'>[];
    records: Record<string, unknown>[];
    recordMeta: RecordMeta[];
    emptyRecordIndices: number[];
}

export interface WritePlan {
    reverts: SourceEdit[];
    unemptiedRows: number[];
    // physical record indices, for setSourceDataAtCell
    sourceEdits: SourceEdit[];
}

/** Nulls out no-op changes in place and returns how many remain. */
export function dropNoopChanges(changes: (CellChange | null)[]): number {
    let remaining = 0;
    for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (!change) continue;
        if (change[2] === change[3]) {
            changes[i] = null;
        } else {
            remaining++;
        }
    }
    return remaining;
}

export function toCellWrites(
    changes: CellChange[],
    tableId: number,
    toPhysicalRow: (row: number) => number
): CellWrite[] {
    return changes.map((change) => ({
        tableId,
        recordIndex: toPhysicalRow(change[0]),
        fieldName: String(change[1]),
        value: change[3]
    }));
}

export function getRowEdits(
    headers: Pick<TableColumn, 'name'>[],
    row: number,
    record: Record<string, unknown>
): SourceEdit[] {
    return headers.map((header) => [row, header.name, record[header.name]]);
}

// Setting a record to empty only changes the first 4 bytes.
export function getEmptyRecordRowEdits(
    headers: Pick<TableColumn, 'name' | 'offset'>[],
    row: number,
    record: Record<string, unknown>
): SourceEdit[] {
    return getRowEdits(
        headers.filter((header) => header.offset < 32),
        row,
        record
    );
}

const toRevert = (change: CellChange): SourceEdit => [
    change[0],
    String(change[1]),
    change[2]
];

/** v4's _processChanges as data. Mutates table and state; the caller applies the plan to Handsontable. */
export function planWriteResult(
    table: WritableTable,
    changes: CellChange[],
    response: WriteBulkTableCellsResult,
    state: WriteState
): WritePlan {
    const plan: WritePlan = { reverts: [], unemptiedRows: [], sourceEdits: [] };

    if (!response.success) {
        plan.reverts = changes.map(toRevert);
        return plan;
    }

    plan.reverts = response.results
        .filter((r) => !r.success)
        .map((r) => changes[r.index])
        .filter(Boolean)
        .map(toRevert);

    for (const row of response.records) {
        if (row.tableId !== table.tableId) continue; // the user switched tables while waiting
        const { recordIndex } = row;

        if (table.records[recordIndex]) {
            // in place, so Handsontable's source row keeps its identity
            Object.assign(table.records[recordIndex], row.record);
        }
        table.recordMeta[recordIndex] = row.recordMeta;

        if (row.cellErrors) {
            state.cellErrors[recordIndex] = row.cellErrors;
        } else {
            delete state.cellErrors[recordIndex];
        }

        if (row.previousRecordMeta?.isEmpty && !row.recordMeta?.isEmpty) {
            plan.unemptiedRows.push(recordIndex);
            plan.sourceEdits.push(
                ...getRowEdits(table.headers, recordIndex, row.record)
            );
        }
    }

    const emptyState = response.emptyStates.find(
        (e) => e.tableId === table.tableId
    );
    if (emptyState) {
        table.emptyRecordIndices = emptyState.emptyRecordIndices;
        state.emptyRecordIndices.clear();
        emptyState.emptyRecordIndices.forEach((i) =>
            state.emptyRecordIndices.add(i)
        );
        for (const { index, record } of emptyState.emptyRecords) {
            plan.sourceEdits.push(
                ...getEmptyRecordRowEdits(table.headers, index, record)
            );
        }
    }

    return plan;
}
