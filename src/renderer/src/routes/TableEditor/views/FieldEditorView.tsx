import TableEditorComponent, {
    BlobEditRequest,
    CellPosition,
    GridHandle,
    GridScroll,
    ReferenceEditRequest
} from '@renderer/components/TableEditorComponent/TableEditorComponent';
import ReferenceEditor from '@renderer/components/ReferenceEditor/ReferenceEditor';
import BlobEditorModal from '@renderer/components/BlobEditor/BlobEditorModal';
import TableHeader from '@renderer/components/TableHeader/TableHeader';
import { TableData } from '@shared/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import { OpenMode } from '@renderer/utils/openMode';
import baseStyles from '../TableEditor.module.scss';
import FieldEditorActionBar, {
    TableActions
} from '../components/TableActionBar/FieldEditorActionBar';
import JumpToColumnModal from '../components/JumpToColumnModal/JumpToColumnModal';

interface Props {
    fileId: string;
    // Selected when the table loads (a followed reference)
    initialSelection?: CellPosition | null;
    // Restored when the table loads (switching back to a tab)
    initialScroll?: GridScroll | null;
    // The tab's orientation, toggled by Switch Orientation
    isInverted: boolean;
    onToggleOrientation: () => void;
    isPinned: boolean;
    // Follow a reference to another table. Must be stable (see TableEditorComponent),
    // as must the two change callbacks.
    onFollowReference: (
        tableId: number,
        recordIndex: number,
        mode: OpenMode
    ) => void;
    onSelectionChange?: (selection: CellPosition) => void;
    onScroll?: (scroll: GridScroll) => void;
    // The action bar's Export and Import (useTableDataCommands)
    onExport: () => void;
    onImport: () => void;
    onTogglePin: () => void;
    setTableLoaderOptions: LoaderOptionsSetter;
    table: TableData;
    tableNames: ReadonlyMap<number, string>;
    // For the reference editor's table list
    tables: { id: number; name: string }[];
}

const FieldEditorView = ({
    fileId,
    initialSelection,
    initialScroll,
    isInverted,
    onToggleOrientation,
    isPinned,
    onFollowReference,
    onSelectionChange,
    onScroll,
    onExport,
    onImport,
    onTogglePin,
    setTableLoaderOptions,
    table,
    tableNames,
    tables
}: Props) => {
    const gridRef = useRef<GridHandle>(null);
    const [referenceEdit, setReferenceEdit] =
        useState<ReferenceEditRequest | null>(null);
    const [blobEdit, setBlobEdit] = useState<BlobEditRequest | null>(null);
    // The open jump modal, with the cell to reselect on close. Kept with its
    // table, so a table switch (the menu) closes it.
    const [jump, setJump] = useState<{
        tableId: number;
        from: CellPosition | null;
    } | null>(null);

    const { tableId } = table;
    if (jump && jump.tableId !== tableId) {
        setJump(null);
    }
    const jumpFrom = jump?.tableId === tableId ? jump.from : undefined;
    const columnNames = useMemo(
        () => table.headers.map((header) => header.name),
        [table]
    );
    const handleFollowReference = useCallback(
        (targetTableId: number, recordIndex: number, mode: OpenMode) => {
            // A self-reference opened in a new tab still gets its own tab
            if (targetTableId === tableId && mode === 'current') {
                gridRef.current?.selectCell(recordIndex, 0);
            } else {
                onFollowReference(targetTableId, recordIndex, mode);
            }
        },
        [onFollowReference, tableId]
    );

    const closeReferenceEditor = (): void => {
        if (referenceEdit) {
            gridRef.current?.selectCell(referenceEdit.row, referenceEdit.col);
        }
        setReferenceEdit(null);
    };

    const closeBlobEditor = (): void => {
        if (blobEdit) {
            gridRef.current?.selectCell(blobEdit.row, blobEdit.col);
        }
        setBlobEdit(null);
    };

    // v4 deselects first, so the grid doesn't take the modal's keys
    const openJumpToColumn = useCallback(() => {
        const from = gridRef.current?.getSelectedCell() ?? null;
        gridRef.current?.deselectCell();
        setJump({ tableId, from });
    }, [tableId]);

    // The modal and the grid handle both talk in (record, field)
    const jumpToCell = (row: number, col: number): void => {
        setJump(null);
        gridRef.current?.selectCell(row, col);
    };

    const closeJumpToColumn = (): void => {
        if (jumpFrom) {
            gridRef.current?.selectCell(jumpFrom.row, jumpFrom.col);
        }
        setJump(null);
    };

    const isModalOpen =
        jumpFrom !== undefined || referenceEdit !== null || blobEdit !== null;
    useEffect(() => {
        if (isModalOpen) return;
        const onKeyDown = (e: KeyboardEvent): void => {
            if (
                !(e.ctrlKey || e.metaKey) ||
                e.key.toLowerCase() !== 'j' ||
                // an edit in progress in the grid's cell editor
                (e.target as HTMLElement | null)?.closest?.(
                    '.handsontableInput'
                )
            ) {
                return;
            }
            e.preventDefault();
            openJumpToColumn();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [isModalOpen, openJumpToColumn]);

    const handleActionClick = (action: number) => {
        if (action === TableActions.EXPORT) {
            onExport();
        } else if (action === TableActions.IMPORT) {
            onImport();
        } else if (action === TableActions.PIN) {
            onTogglePin();
        } else if (action === TableActions.JUMP_TO_COLUMN) {
            openJumpToColumn();
        } else if (action === TableActions.SWITCH_ORIENTATION) {
            onToggleOrientation();
        }
    };

    return (
        <>
            <TableHeader table={table}>
                <FieldEditorActionBar
                    isPinned={isPinned}
                    onActionClick={handleActionClick}
                />
            </TableHeader>
            <div className={baseStyles.tableEditorComponentWrapper}>
                <TableEditorComponent
                    fileId={fileId}
                    initialScroll={initialScroll}
                    initialSelection={initialSelection}
                    isInverted={isInverted}
                    onEditBlob={setBlobEdit}
                    onEditReference={setReferenceEdit}
                    onFollowReference={handleFollowReference}
                    onScroll={onScroll}
                    onSelectionChange={onSelectionChange}
                    ref={gridRef}
                    setLoaderOptions={setTableLoaderOptions}
                    table={table}
                    tableNames={tableNames}
                />
            </div>
            {referenceEdit && (
                <ReferenceEditor
                    anchorRect={referenceEdit.anchorRect}
                    onChange={(binary) =>
                        gridRef.current?.setDataAtCell(
                            referenceEdit.row,
                            referenceEdit.col,
                            binary
                        )
                    }
                    onClose={closeReferenceEditor}
                    tables={tables}
                    value={referenceEdit.value}
                />
            )}
            {jumpFrom !== undefined && (
                <JumpToColumnModal
                    columns={columnNames}
                    initialRow={jumpFrom?.row ?? 0}
                    onClose={closeJumpToColumn}
                    onJump={jumpToCell}
                    rowCount={table.records.length}
                />
            )}
            {blobEdit && (
                <BlobEditorModal
                    onApply={(json) => {
                        gridRef.current?.setDataAtCell(
                            blobEdit.row,
                            blobEdit.col,
                            json
                        );
                        closeBlobEditor();
                    }}
                    onClose={closeBlobEditor}
                    value={blobEdit.value}
                />
            )}
        </>
    );
};

export default FieldEditorView;
