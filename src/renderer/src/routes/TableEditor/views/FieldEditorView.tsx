import TableEditorComponent from '@renderer/components/TableEditorComponent/TableEditorComponent';
import TableHeader from '@renderer/components/TableHeader/TableHeader';
import { FranchiseTableModel } from '@shared/types';
import { useState } from 'react';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import baseStyles from '../TableEditor.module.scss';
import FieldEditorActionBar, {
    TableActions
} from '../components/TableActionBar/FieldEditorActionBar';

interface Props {
    franchiseId: string;
    setTableLoaderOptions: LoaderOptionsSetter;
    table: FranchiseTableModel;
}

enum TableOrientation {
    NORMAL,
    INVERTED
}

const FieldEditorView = ({
    franchiseId,
    setTableLoaderOptions,
    table
}: Props) => {
    const [tableOrientation, setTableOrientation] = useState<TableOrientation>(
        TableOrientation.NORMAL
    );

    const handleActionClick = async (action: number) => {
        if (action === TableActions.EXPORT) {
            const path = await window.api.general.saveDialog({
                title: 'Select destination file for table export',
                filters: [
                    { name: 'Excel workbook', extensions: ['xlsx'] },
                    { name: 'CSV (comma-delimited)', extensions: ['csv'] },
                    {
                        name: 'Excel Macro-Enabled Workbook',
                        extensions: ['xlsm']
                    },
                    { name: 'Excel Binary Workbook', extensions: ['xlsb'] },
                    { name: 'Excel 97-2003 Workbook', extensions: ['xls'] },
                    { name: 'OpenDocument Spreadsheet', extensions: ['ods'] },
                    { name: 'UTF-16 Unicode Text', extensions: ['txt'] }
                ]
            });

            if (path) {
                setTableLoaderOptions({
                    message: 'Exporting...',
                    show: true
                });
                await window.api.franchise.exportTableData({
                    franchiseId: franchiseId,
                    openWhenDone: true,
                    outputFilePath: path,
                    tableInput: {
                        tableUniqueId: table?.uniqueId
                    }
                });
                setTableLoaderOptions({
                    show: false
                });
            }
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
                <FieldEditorActionBar onActionClick={handleActionClick} />
            </TableHeader>
            <div className={baseStyles.tableEditorComponentWrapper}>
                <TableEditorComponent
                    isInverted={tableOrientation === TableOrientation.INVERTED}
                    table={table}
                />
            </div>
        </>
    );
};

export default FieldEditorView;
