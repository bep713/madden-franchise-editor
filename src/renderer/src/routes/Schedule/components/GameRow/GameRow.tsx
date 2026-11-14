import Dropdown from '@renderer/components/Dropdown/Dropdown';
import type {
    GameEdit,
    ScheduleDay,
    ScheduleGame,
    ScheduleTeam
} from '../../scheduleModel';
import { ViewInTableButton, useGameMenu } from '../GameMenu/GameMenu';
import TeamSelect from '../TeamSelect/TeamSelect';
import TimeInput from '../TimeInput/TimeInput';
import styles from './GameRow.module.css';

export interface GameProps {
    game: ScheduleGame;
    teams: readonly ScheduleTeam[];
    days: readonly ScheduleDay[];
    onEdit: (edit: GameEdit) => void;
    onViewInTable: () => void;
}

interface DayProps {
    game: ScheduleGame;
    days: readonly ScheduleDay[];
    onEdit: (edit: GameEdit) => void;
}

export const DaySelect: React.FC<DayProps> = ({
    game,
    days,
    onEdit
}: DayProps) => {
    const dayOptions = days.map((day) => ({
        label: day.abbreviation,
        value: day.name
    }));
    return (
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
    );
};

// Away score first, like the teams
export const finalScore = (game: ScheduleGame): string =>
    `Final ${game.awayScore}–${game.homeScore}`;

// The compact view: one game per row
const GameRow: React.FC<GameProps> = ({
    game,
    teams,
    days,
    onEdit,
    onViewInTable
}: GameProps) => {
    const { onContextMenu, menu } = useGameMenu(onViewInTable);

    return (
        <div
            className={styles.row}
            data-played={game.played || undefined}
            data-record-index={game.recordIndex}
            onContextMenu={onContextMenu}
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
                <DaySelect days={days} game={game} onEdit={onEdit} />
            </div>
            <TimeInput
                aria-label='Time'
                minutes={game.timeOfDay}
                onChange={(minutes) => onEdit({ kind: 'time', minutes })}
            />
            <span className={styles.score}>
                {game.played && finalScore(game)}
            </span>
            <ViewInTableButton onClick={onViewInTable} />
            {menu}
        </div>
    );
};

export default GameRow;
