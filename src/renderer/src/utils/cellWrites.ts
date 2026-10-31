import type {
    CellWrite,
    EmptyRecordsState,
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
// [recordIndex, fieldName, value]. The grid maps it to its own layout.
export type SourceEdit = [row: number, prop: string, value: unknown];

// A cell in record terms, whatever the grid's orientation
export interface RecordCell {
    recordIndex: number;
    fieldIndex: number;
}

// A CellChange resolved to its record and field
export interface RecordChange {
    cell: RecordCell;
    fieldName: string;
    oldValue: unknown;
    newValue: unknown;
}

// Our undo and redo replays. Written to main like a user edit, but not
// recorded on the undo stack.
export const UNDO_SOURCE = 'mfe-undo';
export const REDO_SOURCE = 'mfe-redo';

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
    // Indices of the rejected changes, for the undo stack
    failedChanges: number[];
    // For setSourceDataAtCell, once mapped to the grid's layout
    sourceEdits: SourceEdit[];
}

export interface WritePlanOptions {
    // Add an edit for every field main changed. Needed when the grid's
    // cells are copies of the records (the inverted view).
    syncChangedFields?: boolean;
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
    changes: RecordChange[],
    tableId: number
): CellWrite[] {
    return changes.map((change) => ({
        tableId,
        recordIndex: change.cell.recordIndex,
        fieldName: change.fieldName,
        value: change.newValue
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

const toRevert = (change: RecordChange): SourceEdit => [
    change.cell.recordIndex,
    change.fieldName,
    change.oldValue
];

/** v4's _processChanges as data. Mutates table and state; the caller applies the plan to Handsontable. */
export function planWriteResult(
    table: WritableTable,
    changes: RecordChange[],
    response: WriteBulkTableCellsResult,
    state: WriteState,
    { syncChangedFields = false }: WritePlanOptions = {}
): WritePlan {
    const plan: WritePlan = { reverts: [], failedChanges: [], sourceEdits: [] };

    if (!response.success) {
        plan.reverts = changes.map(toRevert);
        plan.failedChanges = changes.map((_change, index) => index);
        return plan;
    }

    for (const result of response.results) {
        if (!result.success && changes[result.index]) {
            plan.failedChanges.push(result.index);
            plan.reverts.push(toRevert(changes[result.index]));
        }
    }

    for (const row of response.records) {
        if (row.tableId !== table.tableId) continue; // the user switched tables while waiting
        const { recordIndex } = row;

        const current = table.records[recordIndex];
        if (current) {
            if (syncChangedFields) {
                for (const [fieldName, value] of Object.entries(row.record)) {
                    if (current[fieldName] !== value) {
                        plan.sourceEdits.push([recordIndex, fieldName, value]);
                    }
                }
            }
            // in place, so Handsontable's source row keeps its identity
            Object.assign(current, row.record);
        }
        table.recordMeta[recordIndex] = row.recordMeta;

        if (row.cellErrors) {
            state.cellErrors[recordIndex] = row.cellErrors;
        } else {
            delete state.cellErrors[recordIndex];
        }

        if (row.previousRecordMeta?.isEmpty && !row.recordMeta?.isEmpty) {
            plan.sourceEdits.push(
                ...getRowEdits(table.headers, recordIndex, row.record)
            );
        }
    }

    const emptyState = response.emptyStates.find(
        (e) => e.tableId === table.tableId
    );
    if (emptyState) {
        plan.sourceEdits.push(...applyEmptyState(table, emptyState, state));
    }

    return plan;
}

/**
 * Applies a table's new empty-record set from main. Mutates table and state;
 * returns the first-4-byte edits of every empty record, for setSourceDataAtCell.
 */
export function applyEmptyState(
    table: WritableTable,
    emptyState: EmptyRecordsState,
    state: WriteState
): SourceEdit[] {
    const next = new Set(emptyState.emptyRecordIndices);
    for (const index of state.emptyRecordIndices) {
        if (!next.has(index) && table.recordMeta[index]) {
            table.recordMeta[index].isEmpty = false;
        }
    }
    for (const index of next) {
        if (table.recordMeta[index]) {
            table.recordMeta[index].isEmpty = true;
        }
    }

    table.emptyRecordIndices = emptyState.emptyRecordIndices;
    state.emptyRecordIndices.clear();
    next.forEach((i) => state.emptyRecordIndices.add(i));

    const edits: SourceEdit[] = [];
    for (const { index, record } of emptyState.emptyRecords) {
        const rowEdits = getEmptyRecordRowEdits(table.headers, index, record);
        // The inverted view's cells are copies, so the records need it too
        const current = table.records[index];
        if (current) {
            for (const [, fieldName, value] of rowEdits) {
                current[fieldName] = value;
            }
        }
        edits.push(...rowEdits);
    }
    return edits;
}
