import { TableData } from '@shared/types';
import React from 'react';
import styles from './TableHeader.module.css';
import Layout from '../Layout/Layout';
import Text from '../Text/Text';
import { tableTitle } from '@renderer/utils/tableTitle';

interface Props {
    children: React.ReactNode;
    table: Pick<TableData, 'name' | 'tableId'>;
}

const TableHeader: React.FC<Props> = ({ children, table }: Props) => {
    return (
        <div className={styles.wrapper}>
            <Layout direction='row' columnGap='5' alignItems='center'>
                <span data-testid='table-header-title'>
                    <Text typography='labelLarge' weight='medium'>
                        {tableTitle(table.tableId, table.name)}
                    </Text>
                </span>
                {children}
            </Layout>
        </div>
    );
};

export default TableHeader;
