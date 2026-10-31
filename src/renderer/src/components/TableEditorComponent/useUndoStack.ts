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

export interface UndoControls {
    // One entry per user edit (one afterChange call)
    record: (changes: RecordChange[]) => UndoEntry;
    dropChanges: UndoStack['dropChanges'];
    clear: () => void;
}

// Replays an entry through the current orientation, then selects the
// replayed range (which also scrolls it into view)
function replay(
    hot: Handsontable,
    orientation: GridOrientation,
    entry: UndoEntry,
    direction: 'undo' | 'redo'
): void {
    const rowCount = hot.countRows();
    const colCount = hot.countCols();
    const cells: [number, number, unknown][] = [];
    for (const { cell, value } of toReplayChanges(entry, direction)) {
        const [row, col] = orientation.toVisualCell(cell);
        // The record or field no longer exists
        if (row === null || row < 0 || row >= rowCount || col >= colCount) {
            continue;
        }
        cells.push([row, col, value]);
    }
    if (cells.length === 0) {
        return;
    }

    hot.setDataAtCell(cells, direction === 'undo' ? UNDO_SOURCE : REDO_SOURCE);
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

// Our own undo/redo in record terms, in place of Handsontable's UndoRedo
// plugin (turn it off with `undo={false}`). Its entries hold visual cells,
// so they can't follow an orientation switch. Call registerShortcuts once
// the grid exists.
export default function useUndoStack(
    hotRef: RefObject<HotTableRef | null>,
    orientationRef: RefObject<GridOrientation | null>
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
            if (entry) {
                replay(hot, orientation, entry, direction);
            }
        },
        [hotRef, orientationRef, stack]
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
                const entry = { changes };
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
