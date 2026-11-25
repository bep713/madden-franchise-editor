import { TableData } from '@shared/types';
import React from 'react';
import cx from 'classnames';
import styles from './TableHeader.module.css';
import Layout from '../Layout/Layout';
import Text from '../Text/Text';
import { tableTitle } from '@renderer/utils/tableTitle';

interface Props {
    children: React.ReactNode;
    table: Pick<TableData, 'name' | 'tableId'>;
    // Shown in place of the table's title (the compact table picker)
    title?: React.ReactNode;
    // Tighter padding and gaps (compact table editor spacing)
    compact?: boolean;
}

const TableHeader: React.FC<Props> = ({
    children,
    table,
    title,
    compact
}: Props) => {
    return (
        <div className={cx(styles.wrapper, { [styles.compact]: compact })}>
            <Layout
                direction='row'
                columnGap={compact ? '3' : '5'}
                alignItems='center'
            >
                {title ?? (
                    <span data-testid='table-header-title'>
                        <Text typography='labelLarge' weight='medium'>
                            {tableTitle(table.tableId, table.name)}
                        </Text>
                    </span>
                )}
                {children}
            </Layout>
        </div>
    );
};

export default TableHeader;
