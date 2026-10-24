import React from 'react';
import { default as cx } from 'classnames';
import { Link } from 'react-router-dom';

import styles from './NavigationTab.module.scss';
import { SimpleNavigationItem } from '@shared/types';

interface NavigationTabProps {
    isActive?: boolean;
    item: SimpleNavigationItem;
    onClick?: (n: SimpleNavigationItem) => void;
    onClose?: (n: SimpleNavigationItem) => void;
}

const NavigationTab: React.FC<NavigationTabProps> = ({
    item,
    onClick,
    onClose,
    isActive = false
}: NavigationTabProps) => {
    function handleAuxClick(e: React.MouseEvent): void {
        if (item.isClosable && e.button === 1) {
            handleCloseTab(e);
        }
    }

    function handleCloseTab(e: React.MouseEvent): void {
        e.stopPropagation();
        onClose?.(item);
    }

    function handleClick(): void {
        if (!isActive) {
            onClick?.(item);
        }
    }

    function handleMouseDown(e: React.MouseEvent): void {
        if (item.isClosable && e.button === 1) {
            e.preventDefault();
        }
    }

    return (
        <Link
            className={cx(styles.tab, item.classList, {
                closable: item.isClosable,
                active: isActive
            })}
            data-name={item.text}
            onAuxClick={handleAuxClick}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            to={item.href}
        >
            {item.text}
            {item.isClosable && (
                <button
                    className={styles.closeTabButton}
                    onClick={handleCloseTab}
                ></button>
            )}
        </Link>
    );
};

export default NavigationTab;
