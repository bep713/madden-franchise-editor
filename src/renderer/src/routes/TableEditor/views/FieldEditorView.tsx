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
import { useCallback, useRef, useState } from 'react';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import { OpenMode } from '@renderer/utils/openMode';
import baseStyles from '../TableEditor.module.scss';
import FieldEditorActionBar, {
    TableActions
} from '../components/TableActionBar/FieldEditorActionBar';

interface Props {
    fileId: string;
    // Selected when the table loads (a followed reference)
    initialSelection?: CellPosition | null;
    // Restored when the table loads (switching back to a tab)
    initialScroll?: GridScroll | null;
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

enum TableOrientation {
    NORMAL,
    INVERTED
}

const FieldEditorView = ({
    fileId,
    initialSelection,
    initialScroll,
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
    const [tableOrientation, setTableOrientation] = useState<TableOrientation>(
        TableOrientation.NORMAL
    );
    const gridRef = useRef<GridHandle>(null);
    const [referenceEdit, setReferenceEdit] =
        useState<ReferenceEditRequest | null>(null);
    const [blobEdit, setBlobEdit] = useState<BlobEditRequest | null>(null);

    const { tableId } = table;
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

    const handleActionClick = (action: number) => {
        if (action === TableActions.EXPORT) {
            onExport();
        } else if (action === TableActions.IMPORT) {
            onImport();
        } else if (action === TableActions.PIN) {
            onTogglePin();
        } else if (action === TableActions.SWITCH_ORIENTATION) {
            setTableOrientation(
                tableOrientation === TableOrientation.NORMAL
                    ? TableOrientation.INVERTED
                    : TableOrientation.NORMAL
            );
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
                    isInverted={tableOrientation === TableOrientation.INVERTED}
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
