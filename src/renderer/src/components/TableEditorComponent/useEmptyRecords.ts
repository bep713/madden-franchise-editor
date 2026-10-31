import { MutableRefObject, RefObject, useCallback, useMemo } from 'react';
import type { HotTableRef } from '@handsontable/react-wrapper';
import type { SetNextRecordResult, SetRecordsEmptyResult } from '@shared/types';
import { applyEmptyState, WriteState } from '@renderer/utils/cellWrites';
import type { GridOrientation } from './orientation';
import { CellWriteContext, toGridEdits } from './useCellWrites';

type EmptyRecordsResult = SetRecordsEmptyResult | SetNextRecordResult;

// The context menu's empty-record commands. Not undoable, as in v4: the sync
// uses the 'onEmpty' source, which never reaches main or the undo stack.
export default function useEmptyRecords(
    hotRef: RefObject<HotTableRef | null>,
    getContext: () => CellWriteContext | null,
    stateRef: MutableRefObject<WriteState>,
    orientationRef: RefObject<GridOrientation | null>
) {
    const run = useCallback(
        async (
            errorTitle: string,
            call: (context: CellWriteContext) => Promise<EmptyRecordsResult>
        ): Promise<void> => {
            const context = getContext();
            if (!context) {
                return;
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
                    return;
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
                    return;
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
            } finally {
                setLoaderOptions({ show: false });
            }
        },
        [getContext, hotRef, orientationRef, stateRef]
    );

    const setRecordsEmpty = useCallback(
        (indices: number[]) =>
            run('Unable to set records as empty', ({ fileId, table }) =>
                window.franchiseAPI.setTableRecordsEmpty(
                    fileId,
                    table.tableId,
                    indices
                )
            ),
        [run]
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
