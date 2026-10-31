import {
    MutableRefObject,
    RefObject,
    useCallback,
    useLayoutEffect,
    useRef
} from 'react';
import type Handsontable from 'handsontable';
import type { HotTableRef } from '@handsontable/react-wrapper';
import { TableData, WriteBulkTableCellsResult } from '@shared/types';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import {
    CellChange,
    dropNoopChanges,
    IGNORED_CHANGE_SOURCES,
    planWriteResult,
    RecordChange,
    REDO_SOURCE,
    SourceEdit,
    toCellWrites,
    UNDO_SOURCE,
    WriteState
} from '@renderer/utils/cellWrites';
import type { GridOrientation } from './orientation';
import type { UndoControls } from './useUndoStack';

export interface CellWriteContext {
    fileId: string;
    table: TableData;
    setLoaderOptions: LoaderOptionsSetter;
}

// Builds the per-table write state from a freshly read table
export function createWriteState(table: TableData): WriteState {
    return {
        cellErrors: { ...table.cellErrors },
        emptyRecordIndices: new Set(table.emptyRecordIndices)
    };
}

// The grid's changes in record terms. Changes outside the records (the
// inverted field-name column) are dropped.
function toRecordChanges(
    changes: CellChange[],
    orientation: GridOrientation,
    table: TableData
): RecordChange[] {
    const recordChanges: RecordChange[] = [];
    for (const [row, prop, oldValue, newValue] of changes) {
        const cell = orientation.toRecordCell(row, prop);
        const header = cell && table.headers[cell.fieldIndex];
        if (cell && header) {
            recordChanges.push({
                cell,
                fieldName: header.name,
                oldValue,
                newValue
            });
        }
    }
    return recordChanges;
}

// Record-space edits → [row, col/prop, value] in the grid's current layout
export function toGridEdits(
    edits: SourceEdit[],
    orientation: GridOrientation,
    toGrid: GridOrientation['toVisualCell' | 'toSourceCell']
): [number, string | number, unknown][] {
    const gridEdits: [number, string | number, unknown][] = [];
    for (const [recordIndex, fieldName, value] of edits) {
        const fieldIndex = orientation.fieldIndexOf(fieldName);
        if (fieldIndex !== undefined) {
            gridEdits.push([...toGrid({ recordIndex, fieldIndex }), value]);
        }
    }
    return gridEdits;
}

// v4's TableEditorView._beforeChange / _processChanges. `getContext` returns
// the latest props, so the returned hooks stay stable across renders (a new
// function would make the grid re-render, which reloads its data). Changes
// are resolved to (record, field) when made, and the result is applied with
// the orientation of when it arrives, so a switch in between is fine.
export default function useCellWrites(
    hotRef: RefObject<HotTableRef | null>,
    getContext: () => CellWriteContext | null,
    stateRef: MutableRefObject<WriteState>,
    orientationRef: RefObject<GridOrientation | null>,
    undo: Pick<UndoControls, 'record' | 'dropChanges'>
) {
    const getContextRef = useRef(getContext);
    useLayoutEffect(() => {
        getContextRef.current = getContext;
    });

    const beforeChange = useCallback(
        (changes: (Handsontable.CellChange | null)[]): boolean | void => {
            if (!changes) {
                return;
            }
            if (dropNoopChanges(changes as (CellChange | null)[]) === 0) {
                return false; // cancels the change
            }
        },
        []
    );

    const afterChange = useCallback(
        async (
            changes: Handsontable.CellChange[] | null,
            source: string
        ): Promise<void> => {
            const context = getContextRef.current();
            const hot = hotRef.current?.hotInstance;
            const orientation = orientationRef.current;
            if (
                !changes ||
                !context ||
                !hot ||
                !orientation ||
                IGNORED_CHANGE_SOURCES.has(source)
            ) {
                return;
            }

            const { fileId, table, setLoaderOptions } = context;
            // afterChange may still get no-op changes, so filter again
            const changesToSend = toRecordChanges(
                (changes as CellChange[]).filter(
                    (change) => change && change[2] !== change[3]
                ),
                orientation,
                table
            );
            if (changesToSend.length === 0) {
                return;
            }

            // Before the await, so an undo during the write already has it
            const undoEntry =
                source === UNDO_SOURCE || source === REDO_SOURCE
                    ? null
                    : undo.record(changesToSend);

            const showLoader = changesToSend.length > 1;
            if (showLoader) {
                setLoaderOptions({ message: 'Saving changes...', show: true });
                // Let the loader paint before the (possibly long) IPC call
                await new Promise((resolve) =>
                    requestAnimationFrame(() => setTimeout(resolve, 0))
                );
            }

            let response: WriteBulkTableCellsResult;
            try {
                response = await window.franchiseAPI.writeBulkTableCells(
                    fileId,
                    toCellWrites(changesToSend, table.tableId)
                );
            } catch (error) {
                response = {
                    success: false,
                    error: (error as Error)?.message || String(error)
                };
            }

            try {
                if (hot.isDestroyed) {
                    return;
                }
                if (!response.success) {
                    console.warn('Failed to write cells:', response.error);
                }

                // The user switched tables while waiting. The new table is
                // read again from main, so there is nothing to sync.
                if (getContextRef.current()?.table !== table) {
                    return;
                }

                // The orientation may have changed during the write
                const current = orientationRef.current ?? orientation;
                const plan = planWriteResult(
                    table,
                    changesToSend,
                    response,
                    stateRef.current,
                    // Inverted cells are copies of the records
                    { syncChangedFields: current.inverted }
                );
                if (undoEntry) {
                    // A rejected value is never replayed
                    undo.dropChanges(undoEntry, plan.failedChanges);
                }
                if (plan.reverts.length) {
                    hot.setDataAtCell(
                        toGridEdits(
                            plan.reverts,
                            current,
                            current.toVisualCell
                        ) as [number, number, unknown][],
                        'cell-write-revert'
                    );
                }
                if (plan.sourceEdits.length) {
                    hot.setSourceDataAtCell(
                        toGridEdits(
                            plan.sourceEdits,
                            current,
                            current.toSourceCell
                        ),
                        'onEmpty'
                    );
                }
                // exactly one render; cells() picks up errors and empty rows
                hot.render();
            } finally {
                if (showLoader) {
                    setLoaderOptions({ show: false });
                }
            }
        },
        [hotRef, orientationRef, stateRef, undo]
    );

    return { beforeChange, afterChange };
}
