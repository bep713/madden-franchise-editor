import { MutableRefObject, RefObject, useCallback, useMemo } from 'react';
import type { HotTableRef } from '@handsontable/react-wrapper';
import type { SetNextRecordResult, SetRecordsEmptyResult } from '@shared/types';
import {
    applyEmptyState,
    getEmptyRecordRowEdits,
    RecordChange,
    SourceEdit,
    WriteState
} from '@renderer/utils/cellWrites';
import type { GridOrientation } from './orientation';
import { CellWriteContext, toGridEdits } from './useCellWrites';
import type { UndoControls } from './useUndoStack';

type EmptyRecordsResult = SetRecordsEmptyResult | SetNextRecordResult;

// The context menu's empty-record commands. The sync uses the 'onEmpty'
// source, which never reaches main or the undo stack, so "set as empty"
// records its own undo entry (v4 couldn't undo it). Setting the next record
// to use isn't undoable.
export default function useEmptyRecords(
    hotRef: RefObject<HotTableRef | null>,
    getContext: () => CellWriteContext | null,
    stateRef: MutableRefObject<WriteState>,
    orientationRef: RefObject<GridOrientation | null>,
    undo: Pick<UndoControls, 'recordEmpty'>
) {
    // Resolves to whether main made the change
    const run = useCallback(
        async (
            errorTitle: string,
            call: (context: CellWriteContext) => Promise<EmptyRecordsResult>,
            onSuccess?: (
                context: CellWriteContext,
                result: EmptyRecordsResult
            ) => void
        ): Promise<boolean> => {
            const context = getContext();
            if (!context) {
                return false;
            }
            const { table, setLoaderOptions } = context;

            setLoaderOptions({ message: 'Saving changes...', show: true });
            try {
                // Let the loader paint before the IPC call
                await new Promise((resolve) =>
                    requestAnimationFrame(() => setTimeout(resolve, 0))
                );

                let result: EmptyRecordsResult;
                try {
                    result = await call(context);
                } catch (error) {
                    result = {
                        error: (error as Error)?.message || String(error)
                    };
                }

                if ('error' in result) {
                    console.error(`${errorTitle}:`, result.error);
                    await window.electronAPI.showMessageBox({
                        type: 'error',
                        title: errorTitle,
                        message: result.error
                    });
                    return false;
                }

                const hot = hotRef.current?.hotInstance;
                const orientation = orientationRef.current;
                // The user switched tables while waiting. The new table is
                // read again from main, so it already has the change.
                if (
                    !hot ||
                    hot.isDestroyed ||
                    !orientation ||
                    getContext()?.table !== table
                ) {
                    return true;
                }

                const edits = applyEmptyState(table, result, stateRef.current);
                if (edits.length) {
                    hot.setSourceDataAtCell(
                        toGridEdits(
                            edits,
                            orientation,
                            orientation.toSourceCell
                        ),
                        'onEmpty'
                    );
                }
                // cells() picks up the empty styling
                hot.render();
                onSuccess?.(context, result);
                return true;
            } finally {
                setLoaderOptions({ show: false });
            }
        },
        [getContext, hotRef, orientationRef, stateRef]
    );

    // record: false for a redo, which is already on the stack
    const setRecordsEmpty = useCallback(
        (indices: number[], { record = true } = {}) => {
            // Before the call: applyEmptyState overwrites these fields
            const context = getContext();
            const before: SourceEdit[] = [];
            for (const index of indices) {
                const current = context?.table.records[index];
                if (current) {
                    before.push(
                        ...getEmptyRecordRowEdits(
                            context.table.headers,
                            index,
                            current
                        )
                    );
                }
            }

            return run(
                'Unable to set records as empty',
                ({ fileId, table }) =>
                    window.franchiseAPI.setTableRecordsEmpty(
                        fileId,
                        table.tableId,
                        indices
                    ),
                // After success, so an undo can't start before main is done
                ({ table }, result) => {
                    const orientation = orientationRef.current;
                    if (!record || !orientation || 'error' in result) {
                        return;
                    }
                    const changes: RecordChange[] = [];
                    for (const [recordIndex, fieldName, oldValue] of before) {
                        const fieldIndex = orientation.fieldIndexOf(fieldName);
                        if (fieldIndex === undefined) continue;
                        changes.push({
                            cell: { recordIndex, fieldIndex },
                            fieldName,
                            oldValue,
                            newValue: table.records[recordIndex]?.[fieldName]
                        });
                    }
                    if (changes.length) {
                        undo.recordEmpty(indices, changes);
                    }
                }
            );
        },
        [getContext, orientationRef, run, undo]
    );

    const setNextRecordToUse = useCallback(
        (index: number) =>
            run('Unable to set the next empty record', ({ fileId, table }) =>
                window.franchiseAPI.setTableNextRecordToUse(
                    fileId,
                    table.tableId,
                    index
                )
            ),
        [run]
    );

    return useMemo(
        () => ({ setRecordsEmpty, setNextRecordToUse }),
        [setRecordsEmpty, setNextRecordToUse]
    );
}
