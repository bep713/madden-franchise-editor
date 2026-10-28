import React, { useEffect, useLayoutEffect, useRef } from 'react';

import styles from './Navigation.module.scss';
import NavigationTab, { NavigationTabItem } from './NavigationTab';

interface NavigationProps {
    tabs: NavigationTabItem[];
    activeKey?: string;
    showNewTabButton?: boolean;
    onSelect?: (key: string) => void;
    onClose?: (key: string) => void;
    onNewTab?: () => void;
}

const SHOW_SCROLLBAR_MS = 400;

// The <li> of the active tab and of the one to its right
function getActiveItems(list: HTMLUListElement | null): {
    active?: Element;
    next?: Element | null;
} {
    const active = list?.querySelector('[aria-selected="true"]')?.parentElement;
    return { active: active ?? undefined, next: active?.nextElementSibling };
}

const NavigationComponent: React.FC<NavigationProps> = ({
    tabs,
    activeKey,
    showNewTabButton = false,
    onSelect,
    onClose,
    onNewTab
}: NavigationProps) => {
    const listRef = useRef<HTMLUListElement>(null);

    // React's onWheel is passive, so preventDefault needs a native listener
    useEffect(() => {
        const list = listRef.current;
        const onWheel = (e: WheelEvent): void => {
            if (e.deltaY !== 0 && list) {
                e.preventDefault();
                list.scrollLeft += e.deltaY;
            }
        };
        list?.addEventListener('wheel', onWheel, { passive: false });
        return () => list?.removeEventListener('wheel', onWheel);
    }, []);

    // Keep the active tab in view, and "+" too when it is right next to it
    useLayoutEffect(() => {
        const { active, next } = getActiveItems(listRef.current);
        const target = next?.hasAttribute('data-new-tab') ? next : active;
        target?.scrollIntoView?.({ block: 'nearest', inline: 'start' });
    }, [activeKey, tabs.length]);

    // v4's resize handling: flash the scrollbar, and keep the active tab in
    // view (when growing, the tab to its right too)
    useEffect(() => {
        let width = window.innerWidth;
        let timeout: ReturnType<typeof setTimeout> | undefined;

        const onResize = (): void => {
            const list = listRef.current;
            if (!list) {
                return;
            }
            list.classList.add(styles.showScrollbar);
            clearTimeout(timeout);
            timeout = setTimeout(
                () => list.classList.remove(styles.showScrollbar),
                SHOW_SCROLLBAR_MS
            );

            const { active, next } = getActiveItems(list);
            if (window.innerWidth > width) {
                (next ?? active)?.scrollIntoView?.({
                    block: 'nearest',
                    inline: 'end'
                });
            } else {
                active?.scrollIntoView?.({ block: 'nearest', inline: 'start' });
            }
            width = window.innerWidth;
        };

        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
            clearTimeout(timeout);
        };
    }, []);

    return (
        <ul className={styles.tabWrapper} ref={listRef} role='tablist'>
            {tabs.map((tab) => (
                <li
                    key={tab.key}
                    className={styles.tabContainer}
                    role='presentation'
                >
                    <NavigationTab
                        isActive={tab.key === activeKey}
                        onClose={onClose}
                        onSelect={onSelect}
                        tab={tab}
                    />
                </li>
            ))}
            {showNewTabButton && (
                <li
                    className={styles.tabContainer}
                    data-new-tab=''
                    role='presentation'
                >
                    <button
                        aria-label='New tab'
                        className={styles.addTabButton}
                        onClick={onNewTab}
                        type='button'
                    >
                        +
                    </button>
                </li>
            )}
        </ul>
    );
};

export default NavigationComponent;
