import React, { useMemo, useRef, useState } from 'react';
import Modal from '@renderer/components/Modal/Modal';
import Autocomplete from '@renderer/components/Autocomplete/Autocomplete';
import Button from '@renderer/components/Button/Button';
import Textbox from '@renderer/components/Textbox/Textbox';
import { filterColumns, parseRowIndex } from './jumpToColumn';
import styles from './JumpToColumnModal.module.css';

interface Props {
    // Header names, in order
    columns: readonly string[];
    initialRow: number;
    rowCount: number;
    // (record, field). The parent closes the modal.
    onJump: (row: number, col: number) => void;
    onClose: () => void;
}

const JumpToColumnModal: React.FC<Props> = ({
    columns,
    initialRow,
    rowCount,
    onJump,
    onClose
}) => {
    const [column, setColumn] = useState<number | null>(null);
    // Read by Go: the Enter that picks a column also jumps, before a re-render
    const columnRef = useRef<number | null>(null);
    // null shows the chosen column's name
    const [columnText, setColumnText] = useState<string | null>(null);
    const [showOptions, setShowOptions] = useState(true);
    const [rowText, setRowText] = useState(String(initialRow));

    const options = useMemo(
        () =>
            filterColumns(columns, columnText ?? '').map(({ index, name }) => ({
                value: String(index),
                label: name
            })),
        [columns, columnText]
    );

    const chooseColumn = (index: number | null): void => {
        columnRef.current = index;
        setColumn(index);
    };

    const go = (): void => {
        onJump(parseRowIndex(rowText, rowCount), columnRef.current ?? 0);
    };

    return (
        <Modal
            className={styles.dialog}
            headerAction={
                <Button aria-label='Close' onClick={onClose} type='ghost'>
                    X
                </Button>
            }
            onClose={onClose}
            title='Jump to column'
        >
            {/* Enter anywhere jumps, like v4. The column input's own Enter
                handler runs first and picks the highlighted column. */}
            <div
                className={styles.body}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        // No click on a focused button as well, and the grid,
                        // which is listening again after the jump, mustn't
                        // open its cell editor on this Enter
                        e.preventDefault();
                        e.stopPropagation();
                        go();
                    }
                }}
            >
                <p>Jump to the following column at the following row</p>
                <Autocomplete
                    autoFocus
                    label='Column'
                    onFocus={() => setShowOptions(true)}
                    onOptionSelect={(option) => {
                        chooseColumn(Number(option.value));
                        setColumnText(null);
                        setShowOptions(false);
                    }}
                    onShowOptionsChange={setShowOptions}
                    onTextChange={(text) => {
                        // the text no longer names the chosen column
                        chooseColumn(null);
                        setColumnText(text);
                        setShowOptions(true);
                    }}
                    options={options}
                    showOptions={showOptions}
                    text={
                        columnText ?? (column === null ? '' : columns[column])
                    }
                />
                <Textbox
                    label='Row'
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setRowText(e.target.value)
                    }
                    text={rowText}
                    type='text'
                />
                <Button onClick={go} type='primary'>
                    Go
                </Button>
            </div>
        </Modal>
    );
};

export default JumpToColumnModal;
