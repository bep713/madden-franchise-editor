import { useRef, useState } from 'react';
import Back from '@assets/icons/back.svg?react';
import Forward from '@assets/icons/forward.svg?react';
import {
    TabHistory,
    backEntries,
    canGoBack,
    canGoForward,
    forwardEntries
} from '@renderer/tabs/tabHistory';
import HistoryMenu from './HistoryMenu';
import useHoldToOpen from './useHoldToOpen';
import styles from './HistoryButtons.module.scss';

interface Props {
    history?: TabHistory;
    tableNames: ReadonlyMap<number, string>;
    // Move to this index in history.entries
    onGo: (index: number) => void;
}

type Direction = 'back' | 'forward';

interface ButtonProps {
    direction: Direction;
    enabled: boolean;
    onStep: () => void;
    onOpenMenu: (anchor: HTMLElement) => void;
}

const LABELS: Record<Direction, { label: string; shortcut: string }> = {
    back: { label: 'Back', shortcut: 'Alt+Left' },
    forward: { label: 'Forward', shortcut: 'Alt+Right' }
};

const HistoryButton: React.FC<ButtonProps> = ({
    direction,
    enabled,
    onStep,
    onOpenMenu
}: ButtonProps) => {
    const buttonRef = useRef<HTMLButtonElement>(null);
    const handlers = useHoldToOpen(
        onStep,
        () => buttonRef.current && onOpenMenu(buttonRef.current),
        !enabled
    );
    const { label, shortcut } = LABELS[direction];
    const Icon = direction === 'back' ? Back : Forward;
    return (
        <button
            aria-label={label}
            className={styles.button}
            disabled={!enabled}
            ref={buttonRef}
            title={`${label} (${shortcut})`}
            type='button'
            {...handlers}
        >
            <Icon />
        </button>
    );
};

// Browser-style Back and Forward for the active table tab: a click moves one
// step, a hold or a right-click lists the history in that direction
const HistoryButtons: React.FC<Props> = ({
    history,
    tableNames,
    onGo
}: Props) => {
    const [menu, setMenu] = useState<{
        direction: Direction;
        anchorRect: DOMRect;
    } | null>(null);

    const openMenu = (direction: Direction) => (anchor: HTMLElement) =>
        setMenu({ direction, anchorRect: anchor.getBoundingClientRect() });

    const entries =
        menu?.direction === 'back'
            ? backEntries(history)
            : forwardEntries(history);

    return (
        <div className={styles.buttons}>
            <HistoryButton
                direction='back'
                enabled={canGoBack(history)}
                onOpenMenu={openMenu('back')}
                onStep={() => history && onGo(history.index - 1)}
            />
            <HistoryButton
                direction='forward'
                enabled={canGoForward(history)}
                onOpenMenu={openMenu('forward')}
                onStep={() => history && onGo(history.index + 1)}
            />
            {menu && entries.length > 0 && (
                <HistoryMenu
                    anchorRect={menu.anchorRect}
                    entries={entries}
                    onClose={() => setMenu(null)}
                    onPick={(index) => {
                        setMenu(null);
                        onGo(index);
                    }}
                    tableNames={tableNames}
                />
            )}
        </div>
    );
};

export default HistoryButtons;
