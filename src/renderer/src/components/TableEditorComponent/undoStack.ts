import type { RecordCell, RecordChange } from '@renderer/utils/cellWrites';

// One user edit, in record terms, so it replays into the same cells in
// either orientation. 'cells' is a typed value, a paste or a fill. 'empty'
// is "set as empty": its changes are the first-4-byte fields (old value,
// chain pointer). Undo writes the old values back, which takes the records
// out of the chain; redo empties the records again.
export type UndoEntry =
    | { kind: 'cells'; changes: RecordChange[] }
    | { kind: 'empty'; recordIndices: number[]; changes: RecordChange[] };

export interface UndoStack {
    push(entry: UndoEntry): void; // clears redo
    takeUndo(): UndoEntry | null; // moves the entry to redo
    takeRedo(): UndoEntry | null; // moves the entry back to undo
    // Removes the entry if it ends up empty
    dropChanges(entry: UndoEntry, indices: readonly number[]): void;
    clear(): void;
}

// No size limit, like Handsontable's UndoRedo plugin
export function createUndoStack(): UndoStack {
    let done: UndoEntry[] = [];
    let undone: UndoEntry[] = [];

    return {
        push(entry) {
            done.push(entry);
            undone = [];
        },
        takeUndo() {
            const entry = done.pop() ?? null;
            if (entry) undone.push(entry);
            return entry;
        },
        takeRedo() {
            const entry = undone.pop() ?? null;
            if (entry) done.push(entry);
            return entry;
        },
        dropChanges(entry, indices) {
            if (indices.length === 0) return;
            const dropped = new Set(indices);
            entry.changes = entry.changes.filter(
                (_change, index) => !dropped.has(index)
            );
            if (entry.changes.length === 0) {
                done = done.filter((e) => e !== entry);
                undone = undone.filter((e) => e !== entry);
            }
        },
        clear() {
            done = [];
            undone = [];
        }
    };
}

// The changes to apply: oldValue for undo, newValue for redo
export function toReplayChanges(
    entry: UndoEntry,
    direction: 'undo' | 'redo'
): { cell: RecordCell; value: unknown }[] {
    return entry.changes.map((change) => ({
        cell: change.cell,
        value: direction === 'undo' ? change.oldValue : change.newValue
    }));
}
