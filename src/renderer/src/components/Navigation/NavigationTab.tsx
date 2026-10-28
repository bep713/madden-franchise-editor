import React from 'react';
import { default as cx } from 'classnames';

import styles from './NavigationTab.module.scss';
import Close from '@assets/icons/close.svg?react';

export interface NavigationTabItem {
    key: string;
    name: string;
    isClosable?: boolean;
}

interface NavigationTabProps {
    isActive?: boolean;
    tab: NavigationTabItem;
    onSelect?: (key: string) => void;
    onClose?: (key: string) => void;
}

const NavigationTab: React.FC<NavigationTabProps> = ({
    tab,
    onSelect,
    onClose,
    isActive = false
}: NavigationTabProps) => {
    function handleAuxClick(e: React.MouseEvent): void {
        if (tab.isClosable && e.button === 1) {
            handleCloseTab(e);
        }
    }

    function handleCloseTab(e: React.MouseEvent): void {
        e.stopPropagation();
        onClose?.(tab.key);
    }

    function handleClick(): void {
        if (!isActive) {
            onSelect?.(tab.key);
        }
    }

    // No autoscroll on a middle-click close
    function handleMouseDown(e: React.MouseEvent): void {
        if (tab.isClosable && e.button === 1) {
            e.preventDefault();
        }
    }

    return (
        <div
            aria-selected={isActive}
            className={cx(styles.tab, {
                closable: tab.isClosable,
                active: isActive
            })}
            data-name={tab.name}
            onAuxClick={handleAuxClick}
            onClick={handleClick}
            onMouseDown={handleMouseDown}
            role='tab'
        >
            {tab.name}
            {tab.isClosable && (
                <button
                    aria-label='Close tab'
                    className={styles.closeTabButton}
                    onClick={handleCloseTab}
                    type='button'
                >
                    <Close aria-hidden='true' />
                </button>
            )}
        </div>
    );
};

export default NavigationTab;
