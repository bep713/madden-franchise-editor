import React from 'react';
import cx from 'classnames';
import styles from './TableListItem.module.css';

import Layout from '../Layout/Layout';
import Text from '../Text/Text';
import Pushpin from '@assets/icons/pushpin.svg?react';

interface Props {
    component: React.ElementType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    componentProps: any;
    emphasisText?: string;
    table: {
        id: number;
        name: string;
        pinned?: boolean;
        selected?: boolean;
    };
}

const TableListItem: React.FC<Props> = ({
    component: Component = 'div',
    componentProps,
    emphasisText,
    table
}) => {
    const emphasisTextIndex = emphasisText
        ? table.name.toLowerCase().indexOf(emphasisText.toLowerCase())
        : -1;

    const name =
        emphasisText && emphasisTextIndex >= 0 ? (
            <>
                {table.name.substring(0, emphasisTextIndex)}
                <Text typography='body' weight='medium'>
                    {table.name.substring(
                        emphasisTextIndex,
                        emphasisTextIndex + emphasisText.length
                    )}
                </Text>
                {table.name.substring(emphasisTextIndex + emphasisText.length)}
            </>
        ) : (
            table.name
        );

    return (
        <Component
            aria-current={table.selected ? 'true' : undefined}
            className={cx(styles.table, {
                [styles.pinned]: table.pinned,
                [styles.selected]: table.selected
            })}
            data-table-id={table.id}
            key={table.id}
            {...componentProps}
        >
            <Layout direction='column' rowGap='05'>
                <div className={styles.idLabel}>
                    <Text typography='labelSmall' emphasis>
                        {table.id}
                    </Text>
                    {table.pinned && (
                        <Pushpin
                            aria-label='Pinned'
                            className={styles.pinIcon}
                            role='img'
                        />
                    )}
                </div>
                <div className={styles.tableName} title={table.name}>
                    {name}
                </div>
            </Layout>
        </Component>
    );
};

export default TableListItem;
