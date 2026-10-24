import React from 'react';
import cx from 'classnames';
import styles from './Layout.module.css';

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
    columnGap?: Gap;
    children: React.ReactNode;
    direction?: 'column' | 'column-reverse' | 'row' | 'row-reverse';
    fullHeight?: boolean;
    fullWidth?: boolean;
    inline?: boolean;
    justifyContent?:
        | 'end'
        | 'center'
        | 'space-between'
        | 'space-around'
        | 'space-evenly'
        | 'start';
    rowGap?: Gap;
    wrap?: boolean;
}

const FLEX_CLASSES = {
    column: styles.flexColumn,
    'column-reverse': styles.flexColumnReverse,
    row: styles.flexRow,
    'row-reverse': styles.flexRowReverse
};

const ALIGN_CLASSES = {
    end: styles.alignEnd,
    center: styles.alignCenter,
    start: styles.alignStart,
    stretch: styles.alignStretch
};

const JUSTIFY_CLASSES = {
    end: styles.justifyEnd,
    center: styles.justifyCenter,
    'space-between': styles.justifySpaceBetween,
    'space-around': styles.justifySpaceAround,
    'space-evenly': styles.justifySpaceEvenly,
    start: styles.justifyStart
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

const Layout: React.FC<Props> = ({
    alignItems = 'start',
    children,
    columnGap = '2',
    direction = 'row',
    fullHeight = false,
    fullWidth = false,
    inline = false,
    justifyContent = 'start',
    rowGap = '2',
    wrap = false
}) => (
    <div
        className={cx(
            styles.base,
            ALIGN_CLASSES[alignItems],
            COLUMN_GAP_CLASSES[columnGap],
            FLEX_CLASSES[direction],
            JUSTIFY_CLASSES[justifyContent],
            ROW_GAP_CLASSES[rowGap],
            {
                [styles.fullHeight]: fullHeight,
                [styles.fullWidth]: fullWidth,
                [styles.inline]: inline,
                [styles.wrap]: wrap
            }
        )}
    >
        {children}
    </div>
);

export default Layout;
