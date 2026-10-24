import { FranchiseTableModel } from '@shared/types';
import TablePagination, {
    OnChangeFunc as OnPaginationChangeFunc
} from '../components/TablePagination/TablePagination';
import { useCallback, useState } from 'react';
import TableHeader from '@renderer/components/TableHeader/TableHeader';
import baseStyles from '../TableEditor.module.scss';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import TableEditorComponent from '@renderer/components/TableEditorComponent/TableEditorComponent';
import { Allotment } from 'allotment';
import Text from '@renderer/components/Text/Text';
import Layout from '@renderer/components/Layout/Layout';
import ExpressionEditorActionBar, {
    TableActions
} from '../components/TableActionBar/ExpressionEditorActionBar';

interface Props {
    franchiseId: string;
    setTableLoaderOptions: LoaderOptionsSetter;
    table: FranchiseTableModel;
}

function getDisplayValue(
    input?: number,
    format: 'decimal' | 'hex' = 'decimal'
) {
    const valueToDisplay = input ?? '';
    const value = valueToDisplay.toString(format === 'hex' ? 16 : 10);
    return format === 'hex' ? value.toUpperCase() : value;
}

const ExpressionEditorView = ({
    franchiseId,
    setTableLoaderOptions,
    table
}: Props) => {
    const [displayType, setDisplayType] = useState<'decimal' | 'hex'>(
        'decimal'
    );
    const [selectedRecordIndex, setSelectedRecordIndex] = useState(0);

    const handlePaginationChange: OnPaginationChangeFunc = useCallback(
        ({ newIndex }) => {
            setTableLoaderOptions({ message: 'Loading record', show: true });
            setSelectedRecordIndex(newIndex);

            setTimeout(() => setTableLoaderOptions({ show: false }), 100);
        },
        []
    );

    const handleActionClick = async (action: number) => {
        if (action === TableActions.EXPORT) {
            const path = await window.api.general.saveDialog({
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

            if (path) {
                setTableLoaderOptions({
                    message: 'Exporting...',
                    show: true
                });
                await window.api.franchise.exportTableData({
                    expressionOptions: {
                        outputType: displayType,
                        recordIndex: selectedRecordIndex
                    },
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
        } else if (action === TableActions.TOGGLE_HEX) {
            setDisplayType(displayType === 'hex' ? 'decimal' : 'hex');
        }
    };

    const disassembledResult =
        table.records?.[selectedRecordIndex]?.disassembledResult;

    return (
        <>
            <TableHeader table={table}>
                <TablePagination
                    onChange={handlePaginationChange}
                    table={table}
                />
                <ExpressionEditorActionBar onActionClick={handleActionClick} />
            </TableHeader>
            <div className={baseStyles.tableEditorComponentWrapper}>
                <Allotment defaultSizes={[1, 1]}>
                    <Allotment.Pane className={baseStyles.leftPane}>
                        <Layout direction='column' fullHeight>
                            <Text emphasis>Instructions</Text>
                            <TableEditorComponent
                                table={{
                                    records: (
                                        disassembledResult?.disassembledInstructions ||
                                        []
                                    ).map((disassembledInstruction) => ({
                                        fields: {
                                            paramTypeId: {
                                                name: 'paramTypeId',
                                                type: 'int',
                                                value: getDisplayValue(
                                                    disassembledInstruction
                                                        .parsedInstruction
                                                        .instruction
                                                        .paramTypeId,
                                                    displayType
                                                )
                                            },
                                            param: {
                                                name: 'param',
                                                type: 'int',
                                                value: getDisplayValue(
                                                    disassembledInstruction
                                                        .parsedInstruction
                                                        .instruction.param,
                                                    displayType
                                                )
                                            },
                                            opCode: {
                                                name: 'opCode',
                                                type: 'int',
                                                value: getDisplayValue(
                                                    disassembledInstruction
                                                        .parsedInstruction
                                                        .instruction.opCode,
                                                    displayType
                                                )
                                            },
                                            opCodeName: {
                                                name: 'opCodeName',
                                                type: 'string',
                                                value: disassembledInstruction
                                                    .parsedInstruction
                                                    .displayText
                                            },
                                            index: {
                                                name: 'index',
                                                type: 'int',
                                                value: getDisplayValue(
                                                    disassembledInstruction
                                                        .parsedInstruction
                                                        .instruction.index,
                                                    displayType
                                                )
                                            },
                                            output: {
                                                name: 'output',
                                                type: 'string',
                                                value: disassembledInstruction.output
                                            }
                                        }
                                    }))
                                }}
                            />
                        </Layout>
                    </Allotment.Pane>
                    <Allotment.Pane className={baseStyles.rightPane}>
                        <Layout direction='column' fullHeight>
                            <Text emphasis>Output</Text>
                            <textarea
                                className={baseStyles.output}
                                readOnly
                                value={
                                    disassembledResult?.output?.join?.('\n') ||
                                    ''
                                }
                            />
                        </Layout>
                    </Allotment.Pane>
                </Allotment>
            </div>
        </>
    );
};

export default ExpressionEditorView;
