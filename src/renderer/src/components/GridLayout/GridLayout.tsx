import React from 'react';
import cx from 'classnames';
import styles from './GridLayout.module.css';

export type Gap =
    | 'none'
    | '05'
    | '1'
    | '2'
    | '3'
    | '4'
    | '5'
    | '6'
    | '8'
    | '12'
    | '16';

interface Props {
    alignItems?: 'end' | 'center' | 'start' | 'stretch';
    children: React.ReactNode;
    columnGap?: Gap;
    columns?: string;
    justifyItems?: 'end' | 'center' | 'normal' | 'start' | 'stretch';
    rowGap?: Gap;
    rows?: string;
}

const ALIGN_CLASSES = {
    end: styles.alignEnd,
    center: styles.alignCenter,
    start: styles.alignStart,
    stretch: styles.alignStretch
};

const JUSTIFY_CLASSES = {
    end: styles.justifyEnd,
    center: styles.justifyCenter,
    start: styles.justifyStart,
    stretch: styles.justifyStretch,
    normal: styles.justifyNormal
};

const COLUMN_GAP_CLASSES = {
    none: styles.columnGapNone,
    '05': styles.columnGap05,
    '1': styles.columnGap1,
    '2': styles.columnGap2,
    '3': styles.columnGap3,
    '4': styles.columnGap4,
    '5': styles.columnGap5,
    '6': styles.columnGap6,
    '8': styles.columnGap8,
    '12': styles.columnGap12,
    '16': styles.columnGap16
};

const ROW_GAP_CLASSES = {
    none: styles.rowGapNone,
    '05': styles.rowGap05,
    '1': styles.rowGap1,
    '2': styles.rowGap2,
    '3': styles.rowGap3,
    '4': styles.rowGap4,
    '5': styles.rowGap5,
    '6': styles.rowGap6,
    '8': styles.rowGap8,
    '12': styles.rowGap12,
    '16': styles.rowGap16
};

const GridLayout: React.FC<Props> = ({
    alignItems = 'start',
    columnGap = '2',
    columns,
    children,
    justifyItems = 'normal',
    rowGap = '2',
    rows
}) => (
    <div
        className={cx(
            styles.base,
            ALIGN_CLASSES[alignItems],
            COLUMN_GAP_CLASSES[columnGap],
            JUSTIFY_CLASSES[justifyItems],
            ROW_GAP_CLASSES[rowGap]
        )}
        style={{
            gridTemplateColumns: columns,
            gridTemplateRows: rows
        }}
    >
        {children}
    </div>
);

export default GridLayout;
