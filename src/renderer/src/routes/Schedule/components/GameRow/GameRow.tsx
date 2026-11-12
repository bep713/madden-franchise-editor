import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Jump from '@assets/icons/jump.svg?react';
import Dropdown from '@renderer/components/Dropdown/Dropdown';
import { placePopover } from '@renderer/utils/popover';
import type {
    GameEdit,
    ScheduleDay,
    ScheduleGame,
    ScheduleTeam
} from '../../scheduleModel';
import TeamSelect from '../TeamSelect/TeamSelect';
import TimeInput from '../TimeInput/TimeInput';
import styles from './GameRow.module.css';

const VIEW_IN_TABLE = 'View in table editor';

interface Props {
    game: ScheduleGame;
    teams: readonly ScheduleTeam[];
    days: readonly ScheduleDay[];
    onEdit: (edit: GameEdit) => void;
    onViewInTable: () => void;
}

interface MenuProps {
    at: { x: number; y: number };
    onPick: () => void;
    onClose: () => void;
}

// The row's right-click menu, with its one item
const RowMenu: React.FC<MenuProps> = ({ at, onPick, onClose }: MenuProps) => {
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
                    // React bubbles it through the portal to the row,
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

const GameRow: React.FC<Props> = ({
    game,
    teams,
    days,
    onEdit,
    onViewInTable
}: Props) => {
    const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);

    const dayOptions = days.map((day) => ({
        label: day.abbreviation,
        value: day.name
    }));

    return (
        <div
            className={styles.row}
            data-played={game.played || undefined}
            data-record-index={game.recordIndex}
            onContextMenu={(e) => {
                e.preventDefault();
                setMenuAt({ x: e.clientX, y: e.clientY });
            }}
        >
            <TeamSelect
                label='Away team'
                onChange={(team) =>
                    onEdit({ kind: 'team', side: 'away', team })
                }
                teams={teams}
                value={game.awayTeam}
            />
            <span aria-hidden className={styles.at}>
                @
            </span>
            <TeamSelect
                label='Home team'
                onChange={(team) =>
                    onEdit({ kind: 'team', side: 'home', team })
                }
                teams={teams}
                value={game.homeTeam}
            />
            <div className={styles.day}>
                <Dropdown
                    aria-label='Day'
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const day = days.find((d) => d.name === e.target.value);
                        if (day && day.name !== game.day?.name) {
                            onEdit({ kind: 'day', day });
                        }
                    }}
                    options={
                        // An unknown DayOfWeek: blank until a day is picked
                        game.day
                            ? dayOptions
                            : [{ label: '', value: '' }, ...dayOptions]
                    }
                    value={game.day?.name ?? ''}
                />
            </div>
            <TimeInput
                aria-label='Time'
                minutes={game.timeOfDay}
                onChange={(minutes) => onEdit({ kind: 'time', minutes })}
            />
            <span className={styles.score}>
                {game.played && `Final ${game.awayScore}–${game.homeScore}`}
            </span>
            <button
                aria-label={VIEW_IN_TABLE}
                className={styles.viewButton}
                onClick={onViewInTable}
                title={VIEW_IN_TABLE}
                type='button'
            >
                <Jump aria-hidden />
            </button>
            {menuAt && (
                <RowMenu
                    at={menuAt}
                    onClose={() => setMenuAt(null)}
                    onPick={() => {
                        setMenuAt(null);
                        onViewInTable();
                    }}
                />
            )}
        </div>
    );
};

export default GameRow;
