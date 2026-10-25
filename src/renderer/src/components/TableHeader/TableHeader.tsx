import { TableData } from '@shared/types';
import React from 'react';
import styles from './TableHeader.module.css';
import Layout from '../Layout/Layout';
import Text from '../Text/Text';

interface Props {
    children: React.ReactNode;
    table: Pick<TableData, 'name' | 'tableId'>;
}

// Some tables are unnamed: their name is empty or only NUL characters
// ("\u0000" for 4096 in M22). Those show just the id.
const isUnnamed = (name: string) => name.replace(/\0/g, '').trim() === '';

const TableHeader: React.FC<Props> = ({ children, table }: Props) => {
    return (
        <div className={styles.wrapper}>
            <Layout direction='row' columnGap='5' alignItems='center'>
                <span data-testid='table-header-title'>
                    <Text typography='labelLarge' weight='medium'>
                        {isUnnamed(table.name)
                            ? table.tableId
                            : `${table.tableId} - ${table.name}`}
                    </Text>
                </span>
                {children}
            </Layout>
        </div>
    );
};

export default TableHeader;
