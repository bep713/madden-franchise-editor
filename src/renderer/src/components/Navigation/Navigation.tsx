import React from 'react';
import { default as cx } from 'classnames';

import styles from './Navigation.module.scss';
import { SimpleNavigationItem } from '@shared/types';
import NavigationTab from './NavigationTab';

interface NavigationProps {
    items: SimpleNavigationItem[];
    showNewTabButton?: boolean;
    onTabClick?: (item: SimpleNavigationItem) => void;
    onNewTabClick?: () => void;
}

const NavigationComponent: React.FC<NavigationProps> = ({
    items,
    onTabClick
}: NavigationProps) => {
    function handleTabClick(item: SimpleNavigationItem): void {
        onTabClick?.(item);
    }

    return (
        <ul className={styles.tabWrapper}>
            {items.map((item) => (
                <li
                    key={item.id}
                    className={cx(item.containerClassList, styles.tab)}
                >
                    <NavigationTab
                        item={item}
                        isActive={false}
                        onClick={handleTabClick}
                    />
                </li>
            ))}
        </ul>
    );
};

export default NavigationComponent;
