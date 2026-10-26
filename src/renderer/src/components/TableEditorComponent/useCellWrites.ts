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
    toCellWrites,
    WriteState
} from '@renderer/utils/cellWrites';

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

// v4's TableEditorView._beforeChange / _processChanges. `getContext` returns
// the latest props, so the returned hooks stay stable across renders (a new
// function would make the grid re-render, which reloads its data).
export default function useCellWrites(
    hotRef: RefObject<HotTableRef | null>,
    getContext: () => CellWriteContext | null,
    stateRef: MutableRefObject<WriteState>
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
            if (
                !changes ||
                !context ||
                !hot ||
                IGNORED_CHANGE_SOURCES.has(source)
            ) {
                return;
            }

            // afterChange may still get no-op changes, so filter again
            const changesToSend = (changes as CellChange[]).filter(
                (change) => change && change[2] !== change[3]
            );
            if (changesToSend.length === 0) {
                return;
            }

            const { fileId, table, setLoaderOptions } = context;
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
                    toCellWrites(changesToSend, table.tableId, (row) =>
                        hot.toPhysicalRow(row)
                    )
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

                const plan = planWriteResult(
                    table,
                    changesToSend,
                    response,
                    stateRef.current
                );
                if (plan.reverts.length) {
                    hot.setDataAtRowProp(plan.reverts, 'cell-write-revert');
                }
                if (plan.sourceEdits.length) {
                    // physical indices
                    hot.setSourceDataAtCell(plan.sourceEdits, 'onEmpty');
                }
                // exactly one render; cells() picks up errors and empty rows
                hot.render();
            } finally {
                if (showLoader) {
                    setLoaderOptions({ show: false });
                }
            }
        },
        [hotRef, stateRef]
    );

    return { beforeChange, afterChange };
}
