import React from 'react';
import styles from './SideNav.module.css';

import Layout from '../Layout/Layout';
import List from '../List/List';

interface Props {
    itemComponent?: React.ElementType;
    items: {
        leftAsset: React.ReactNode;
        text: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [key: string]: any;
    }[];
}

const SideNav: React.FC<Props> = ({
    itemComponent: Component = 'div',
    items
}) => (
    <div className={styles.sideNav}>
        <List
            direction='vertical'
            divider='solid'
            gap='4'
            items={items?.map?.(({ leftAsset, text, ...props }) => (
                <Component className={styles.item} key={text} {...props}>
                    <Layout
                        alignItems='center'
                        columnGap='3'
                        direction='row'
                        key={text}
                    >
                        {leftAsset}
                        {text}
                    </Layout>
                </Component>
            ))}
        />
    </div>
);

export default SideNav;
