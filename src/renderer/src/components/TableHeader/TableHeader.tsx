import { FranchiseBaseTableModel } from '@shared/types';
import React from 'react';
import styles from './TableHeader.module.css';
import Layout from '../Layout/Layout';
import Text from '../Text/Text';

interface Props {
    children: React.ReactNode;
    table: FranchiseBaseTableModel;
}

const TableHeader: React.FC<Props> = ({ children, table }: Props) => {
    return (
        <div className={styles.wrapper}>
            <Layout direction='row' columnGap='5' alignItems='center'>
                <Text typography='labelLarge' weight='medium'>
                    {table.id} - {table.name}
                </Text>
                {children}
            </Layout>
        </div>
    );
};

export default TableHeader;
