import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Jump from '@assets/icons/jump.svg?react';
import { placePopover } from '@renderer/utils/popover';
import styles from './GameMenu.module.css';

export const VIEW_IN_TABLE = 'View in table editor';

interface MenuProps {
    at: { x: number; y: number };
    onPick: () => void;
    onClose: () => void;
}

// A game's right-click menu, with its one item
const GameMenu: React.FC<MenuProps> = ({ at, onPick, onClose }: MenuProps) => {
    const menuRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState({ top: at.y, left: at.x });

    useLayoutEffect(() => {
        const el = menuRef.current;
        setPos(
            placePopover(
                { top: at.y, bottom: at.y, left: at.x },
                { width: el?.offsetWidth ?? 0, height: el?.offsetHeight ?? 0 },
                { width: window.innerWidth, height: window.innerHeight }
            )
        );
        el?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    }, [at]);

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

    return createPortal(
        <>
            <div
                className={styles.underlay}
                data-testid='game-menu-underlay'
                onClick={onClose}
                onContextMenu={(e) => {
                    // React bubbles it through the portal to the game,
                    // which would reopen the menu
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                }}
            />
            <div
                className={styles.menu}
                onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                ref={menuRef}
                role='menu'
                style={{ top: pos.top, left: pos.left }}
            >
                <button
                    className={styles.menuItem}
                    data-action='view-in-table'
                    onClick={onPick}
                    role='menuitem'
                    type='button'
                >
                    {VIEW_IN_TABLE}
                </button>
            </div>
        </>,
        document.body
    );
};

interface ViewButtonProps {
    onClick: () => void;
}

export const ViewInTableButton: React.FC<ViewButtonProps> = ({
    onClick
}: ViewButtonProps) => (
    <button
        aria-label={VIEW_IN_TABLE}
        className={styles.viewButton}
        onClick={onClick}
        title={VIEW_IN_TABLE}
        type='button'
    >
        <Jump aria-hidden />
    </button>
);

// The open state for a game's menu: spread `onContextMenu` on the game's
// root and render `menu` inside it
export function useGameMenu(onViewInTable: () => void): {
    onContextMenu: (e: React.MouseEvent) => void;
    menu: React.ReactNode;
} {
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
    return {
        onContextMenu: (e) => {
            e.preventDefault();
            setMenuAt({ x: e.clientX, y: e.clientY });
        },
        menu: menuAt && (
            <GameMenu
                at={menuAt}
                onClose={() => setMenuAt(null)}
                onPick={() => {
                    setMenuAt(null);
                    onViewInTable();
                }}
            />
        )
    };
}

export default GameMenu;
