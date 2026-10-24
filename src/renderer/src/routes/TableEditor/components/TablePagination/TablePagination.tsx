import Layout from '@renderer/components/Layout/Layout';
import Textbox from '@renderer/components/Textbox/Textbox';
import { FranchiseTableModel } from '@shared/types';
import { ChangeEvent, useCallback, useRef, useState } from 'react';
import styles from './TablePagination.module.scss';

interface Props {
    initialPage?: number;
    onChange: OnChangeFunc;
    table: FranchiseTableModel;
}

export type OnChangeFunc = ({
    oldIndex,
    newIndex
}: {
    oldIndex: number;
    newIndex: number;
}) => void;

const TablePagination = ({ initialPage = 0, onChange, table }: Props) => {
    const [text, setText] = useState((initialPage + 1).toString());
    const [currentPage, setCurrentPage] = useState(initialPage);
    const currentPageRef = useRef(currentPage);
    const maxPageValue = table.records.length - 1;

    const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        setText(e.target.value);
    }, []);

    const handleBlur = useCallback(
        (e: ChangeEvent<HTMLInputElement>) => {
            const inputValue = (parseInt(e.target.value) || 0) - 1;
            const clampedValue =
                inputValue < 0
                    ? 0
                    : inputValue >= maxPageValue
                      ? maxPageValue
                      : inputValue;

            onChange?.({
                oldIndex: currentPageRef.current,
                newIndex: clampedValue
            });
            setCurrentPage(clampedValue);
            setText((clampedValue + 1).toString());
            currentPageRef.current = clampedValue;
        },
        [maxPageValue]
    );

    return (
        <Layout alignItems='center'>
            Record{' '}
            <Textbox
                className={styles.textbox}
                onBlur={handleBlur}
                onChange={handleChange}
                text={text}
            />{' '}
            of {table.records.length}
        </Layout>
    );
};

export default TablePagination;
