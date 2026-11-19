import { TableData } from '@shared/types';
import { DisassembledInstructionsResult } from '@shared/types/frtk';
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
    setTableLoaderOptions: LoaderOptionsSetter;
    table: TableData;
}

const INSTRUCTION_HEADERS = [
    'paramTypeId',
    'param',
    'opCode',
    'opCodeName',
    'index',
    'output'
].map((name) => ({ name }));

function getDisplayValue(
    input?: number,
    format: 'decimal' | 'hex' = 'decimal'
) {
    const valueToDisplay = input ?? '';
    const value = valueToDisplay.toString(format === 'hex' ? 16 : 10);
    return format === 'hex' ? value.toUpperCase() : value;
}

const ExpressionEditorView = ({ setTableLoaderOptions, table }: Props) => {
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
        [setTableLoaderOptions]
    );

    const handleActionClick = async (action: number) => {
        if (action === TableActions.EXPORT) {
            // TODO(frtk): expression export needs frtk in main; SPEX tables
            // are never produced until then.
        } else if (action === TableActions.TOGGLE_HEX) {
            setDisplayType(displayType === 'hex' ? 'decimal' : 'hex');
        }
    };

    const disassembledResult = table.records[selectedRecordIndex]
        ?.disassembledResult as DisassembledInstructionsResult | undefined;

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
                                    headers: INSTRUCTION_HEADERS,
                                    records: (
                                        disassembledResult?.disassembledInstructions ||
                                        []
                                    ).map(({ output, parsedInstruction }) => ({
                                        paramTypeId: getDisplayValue(
                                            parsedInstruction.instruction
                                                .paramTypeId,
                                            displayType
                                        ),
                                        param: getDisplayValue(
                                            parsedInstruction.instruction.param,
                                            displayType
                                        ),
                                        opCode: getDisplayValue(
                                            parsedInstruction.instruction
                                                .opCode,
                                            displayType
                                        ),
                                        opCodeName:
                                            parsedInstruction.displayText,
                                        index: getDisplayValue(
                                            parsedInstruction.instruction.index,
                                            displayType
                                        ),
                                        output
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
