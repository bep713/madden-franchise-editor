import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Text from '@renderer/components/Text/Text';
import { IndexedEntry } from '@renderer/tabs/tabHistory';
import { placePopover } from '@renderer/utils/popover';
import { isUnnamed } from '@renderer/utils/tableTitle';
import styles from './HistoryButtons.module.scss';

interface Props {
    anchorRect: DOMRect;
    // Nearest first
    entries: IndexedEntry[];
    tableNames: ReadonlyMap<number, string>;
    onPick: (index: number) => void;
    onClose: () => void;
}

// The list of a Back or Forward button's history, below the button
const HistoryMenu: React.FC<Props> = ({
    anchorRect,
    entries,
    tableNames,
    onPick,
    onClose
}) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: anchorRect.bottom, left: 0 });

    useLayoutEffect(() => {
        const el = menuRef.current;
        const size = el
            ? { width: el.offsetWidth, height: el.offsetHeight }
            : { width: 0, height: 0 };
        setPos(
            placePopover(anchorRect, size, {
                width: window.innerWidth,
                height: window.innerHeight
            })
        );
    }, [anchorRect]);

    useEffect(() => {
        menuRef.current
            ?.querySelector<HTMLElement>('[role="menuitem"]')
            ?.focus();
    }, []);

    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent): void => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCloseRef.current();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    const onMenuKeyDown = (e: React.KeyboardEvent): void => {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') {
            return;
        }
        e.preventDefault();
        const items = Array.from(
            menuRef.current?.querySelectorAll<HTMLElement>(
                '[role="menuitem"]'
            ) ?? []
        );
        const current = items.indexOf(document.activeElement as HTMLElement);
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const next = (current + step + items.length) % items.length;
        items[next]?.focus();
    };

    return createPortal(
        <>
            <div
                className={styles.underlay}
                data-testid='history-menu-underlay'
                onClick={onClose}
            />
            <div
                className={styles.menu}
                onKeyDown={onMenuKeyDown}
                ref={menuRef}
                role='menu'
                style={{ top: pos.top, left: pos.left }}
            >
                {entries.map(({ index, entry }) => {
                    const name = tableNames.get(entry.tableId) ?? '';
                    return (
                        <button
                            className={styles.menuItem}
                            data-history-index={index}
                            data-table-id={entry.tableId}
                            key={index}
                            onClick={() => onPick(index)}
                            role='menuitem'
                            type='button'
                        >
                            <Text typography='labelSmall' emphasis>
                                {entry.tableId}
                            </Text>
                            {isUnnamed(name) ? (
                                // Keeps the name's line, so every row has
                                // the same baseline and height
                                <span aria-hidden className={styles.menuName}>
                                    {' '}
                                </span>
                            ) : (
                                <span className={styles.menuName} title={name}>
                                    {name}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
        </>,
        document.body
    );
};

export default HistoryMenu;
