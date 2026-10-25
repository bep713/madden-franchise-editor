import TableEditorComponent from '@renderer/components/TableEditorComponent/TableEditorComponent';
import TableHeader from '@renderer/components/TableHeader/TableHeader';
import { TableData } from '@shared/types';
import { useState } from 'react';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import baseStyles from '../TableEditor.module.scss';
import FieldEditorActionBar, {
    TableActions
} from '../components/TableActionBar/FieldEditorActionBar';

interface Props {
    setTableLoaderOptions: LoaderOptionsSetter;
    table: TableData;
}

enum TableOrientation {
    NORMAL,
    INVERTED
}

const FieldEditorView = ({ setTableLoaderOptions, table }: Props) => {
    const [tableOrientation, setTableOrientation] = useState<TableOrientation>(
        TableOrientation.NORMAL
    );

    const handleActionClick = async (action: number) => {
        if (action === TableActions.EXPORT) {
            const result = await window.electronAPI.showSaveDialog({
                defaultPath: table.name,
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

            if (!result.canceled && result.filePath) {
                setTableLoaderOptions({
                    message: 'Exporting...',
                    show: true
                });
                // Same rows as v4's externalDataService.exportTableData
                const headers = table.headers.map((header) => header.name);
                const rows = table.records.map((record) =>
                    headers.map((name) => record[name] ?? '')
                );
                try {
                    await window.electronAPI.externalData.export(
                        result.filePath,
                        headers,
                        rows
                    );
                } catch (error) {
                    console.error(error);
                    await window.electronAPI.showMessageBox({
                        type: 'error',
                        message: 'Could not export the table.',
                        detail: (error as Error).message
                    });
                } finally {
                    setTableLoaderOptions({
                        show: false
                    });
                }
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
