import { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import type Handsontable from 'handsontable';
import type { HotTableRef } from '@handsontable/react-wrapper';
import {
    REDO_SOURCE,
    RecordChange,
    UNDO_SOURCE
} from '@renderer/utils/cellWrites';
import type { GridOrientation } from './orientation';
import {
    createUndoStack,
    toReplayChanges,
    UndoEntry,
    UndoStack
} from './undoStack';

const SHORTCUTS_GROUP = 'mfeUndoRedo';

export type EmptyHandler = (recordIndices: number[]) => Promise<boolean>;

export interface UndoControls {
    // One entry per user edit (one afterChange call)
    record: (changes: RecordChange[]) => UndoEntry;
    // One "set as empty" that succeeded. changes are its first-4-byte fields.
    recordEmpty: (
        recordIndices: number[],
        changes: RecordChange[]
    ) => UndoEntry;
    dropChanges: UndoStack['dropChanges'];
    clear: () => void;
}

// The entry's cells in the current orientation, skipping records and fields
// that no longer exist
function toVisualCells(
    hot: Handsontable,
    orientation: GridOrientation,
    entry: UndoEntry,
    direction: 'undo' | 'redo'
): [number, number, unknown][] {
    const rowCount = hot.countRows();
    const colCount = hot.countCols();
    const cells: [number, number, unknown][] = [];
    for (const { cell, value } of toReplayChanges(entry, direction)) {
        const [row, col] = orientation.toVisualCell(cell);
        if (row === null || row < 0 || row >= rowCount || col >= colCount) {
            continue;
        }
        cells.push([row, col, value]);
    }
    return cells;
}

// Selects the cells' bounding range, which also scrolls it into view
function selectRange(
    hot: Handsontable,
    cells: [number, number, unknown][]
): void {
    if (cells.length === 0) {
        return;
    }
    let [top, left] = cells[0];
    let [bottom, right] = cells[0];
    for (const [row, col] of cells) {
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
        left = Math.min(left, col);
        right = Math.max(right, col);
    }
    hot.selectCell(top, left, bottom, right);
}

// Replays an entry's values through the current orientation, then selects
// the replayed range
function replay(
    hot: Handsontable,
    orientation: GridOrientation,
    entry: UndoEntry,
    direction: 'undo' | 'redo'
): void {
    const cells = toVisualCells(hot, orientation, entry, direction);
    if (cells.length === 0) {
        return;
    }
    hot.setDataAtCell(cells, direction === 'undo' ? UNDO_SOURCE : REDO_SOURCE);
    selectRange(hot, cells);
}

// Our own undo/redo in record terms, in place of Handsontable's UndoRedo
// plugin (turn it off with `undo={false}`). Its entries hold visual cells,
// so they can't follow an orientation switch. Call registerShortcuts once
// the grid exists. emptyHandlerRef empties records again for a redo of
// "set as empty" (replaying the pointer values would leave the records out of
// the chain); it returns false on an error.
export default function useUndoStack(
    hotRef: RefObject<HotTableRef | null>,
    orientationRef: RefObject<GridOrientation | null>,
    emptyHandlerRef: RefObject<EmptyHandler | null>
): UndoControls & { registerShortcuts: () => () => void } {
    // One stack for the grid's lifetime
    const [stack] = useState(createUndoStack);

    const run = useCallback(
        (direction: 'undo' | 'redo') => {
            const hot = hotRef.current?.hotInstance;
            const orientation = orientationRef.current;
            if (!hot || !orientation) {
                return;
            }

            const entry =
                direction === 'undo' ? stack.takeUndo() : stack.takeRedo();
            if (!entry) {
                return;
            }
            if (direction === 'undo' || entry.kind === 'cells') {
                replay(hot, orientation, entry, direction);
                return;
            }

            const emptyRecords = emptyHandlerRef.current;
            if (!emptyRecords) {
                return;
            }
            void emptyRecords(entry.recordIndices).then((success) => {
                if (!success) {
                    // Not redone, so it can't be undone either
                    stack.dropChanges(
                        entry,
                        entry.changes.map((_change, index) => index)
                    );
                    return;
                }
                const current = orientationRef.current ?? orientation;
                if (!hot.isDestroyed) {
                    selectRange(
                        hot,
                        toVisualCells(hot, current, entry, direction)
                    );
                }
            });
        },
        [emptyHandlerRef, hotRef, orientationRef, stack]
    );

    const registerShortcuts = useCallback(() => {
        const hot = hotRef.current?.hotInstance;
        if (!hot) {
            return () => {};
        }
        const context = hot.getShortcutManager().getContext('grid');
        // Like the plugin: right Alt triggers Alt+Ctrl on some systems. The
        // typings leave out the event that runOnlyIf gets.
        const runOnlyIf = ((event: KeyboardEvent) =>
            !event.altKey) as unknown as () => boolean;
        context?.addShortcuts([
            {
                keys: [['Control/Meta', 'z']],
                callback: () => run('undo'),
                group: SHORTCUTS_GROUP,
                runOnlyIf
            },
            {
                keys: [
                    ['Control/Meta', 'y'],
                    ['Control/Meta', 'Shift', 'z']
                ],
                callback: () => run('redo'),
                group: SHORTCUTS_GROUP,
                runOnlyIf
            }
        ]);
        return () => {
            if (!hot.isDestroyed) {
                context?.removeShortcutsByGroup(SHORTCUTS_GROUP);
            }
        };
    }, [hotRef, run]);

    // Nothing to undo once the grid is gone
    useEffect(() => () => stack.clear(), [stack]);

    return useMemo(
        () => ({
            record: (changes: RecordChange[]) => {
                const entry: UndoEntry = { kind: 'cells', changes };
                stack.push(entry);
                return entry;
            },
            recordEmpty: (recordIndices: number[], changes: RecordChange[]) => {
                const entry: UndoEntry = {
                    kind: 'empty',
                    recordIndices,
                    changes
                };
                stack.push(entry);
                return entry;
            },
            dropChanges: (entry, indices) => stack.dropChanges(entry, indices),
            clear: () => stack.clear(),
            registerShortcuts
        }),
        [registerShortcuts, stack]
    );
}
