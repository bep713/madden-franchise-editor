import { describe, expect, it } from 'vitest';
import type { RecordChange } from '@renderer/utils/cellWrites';
import { createUndoStack, toReplayChanges, type UndoEntry } from './undoStack';

const change = (recordIndex: number, oldValue: unknown, newValue: unknown) =>
    ({
        cell: { recordIndex, fieldIndex: 0 },
        fieldName: 'A',
        oldValue,
        newValue
    }) satisfies RecordChange;

const entry = (...changes: RecordChange[]): UndoEntry => ({
    kind: 'cells',
    changes
});

describe('createUndoStack', () => {
    it('moves entries between undo and redo', () => {
        const stack = createUndoStack();
        const first = entry(change(0, 1, 2));
        const second = entry(change(1, 3, 4));
        stack.push(first);
        stack.push(second);

        expect(stack.takeUndo()).toBe(second);
        expect(stack.takeUndo()).toBe(first);
        expect(stack.takeUndo()).toBeNull();
        expect(stack.takeRedo()).toBe(first);
        expect(stack.takeUndo()).toBe(first);
    });

    it('clears redo on push', () => {
        const stack = createUndoStack();
        stack.push(entry(change(0, 1, 2)));
        stack.takeUndo();
        stack.push(entry(change(1, 3, 4)));
        expect(stack.takeRedo()).toBeNull();
    });

    it('drops failed changes, and the entry once none are left', () => {
        const stack = createUndoStack();
        const kept = entry(change(0, 1, 2));
        const partial = entry(change(1, 3, 4), change(2, 5, 6));
        stack.push(kept);
        stack.push(partial);

        stack.dropChanges(partial, [0]);
        expect(partial.changes).toEqual([change(2, 5, 6)]);

        stack.dropChanges(partial, [0]);
        expect(stack.takeUndo()).toBe(kept);
    });

    it('drops an entry that is on the redo list', () => {
        const stack = createUndoStack();
        const failed = entry(change(0, 1, 2));
        stack.push(failed);
        stack.takeUndo();
        stack.dropChanges(failed, [0]);
        expect(stack.takeRedo()).toBeNull();
    });

    it('keeps an empty entry with its record indices', () => {
        const stack = createUndoStack();
        const emptied: UndoEntry = {
            kind: 'empty',
            recordIndices: [3],
            changes: [change(3, 7, 21)]
        };
        stack.push(entry(change(0, 1, 2)));
        stack.push(emptied);
        expect(stack.takeUndo()).toBe(emptied);
        expect(stack.takeRedo()).toBe(emptied);

        stack.dropChanges(emptied, [0]);
        expect(stack.takeUndo()).not.toBe(emptied);
    });

    it('clears both lists', () => {
        const stack = createUndoStack();
        stack.push(entry(change(0, 1, 2)));
        stack.push(entry(change(1, 3, 4)));
        stack.takeUndo();
        stack.clear();
        expect(stack.takeUndo()).toBeNull();
        expect(stack.takeRedo()).toBeNull();
    });
});

describe('toReplayChanges', () => {
    it('gives old values for undo and new values for redo', () => {
        const replayed = entry(change(3, 'old', 'new'));
        expect(toReplayChanges(replayed, 'undo')).toEqual([
            { cell: { recordIndex: 3, fieldIndex: 0 }, value: 'old' }
        ]);
        expect(toReplayChanges(replayed, 'redo')).toEqual([
            { cell: { recordIndex: 3, fieldIndex: 0 }, value: 'new' }
        ]);
    });
});
