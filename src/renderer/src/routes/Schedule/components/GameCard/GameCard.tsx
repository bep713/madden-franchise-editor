import { ViewInTableButton, useGameMenu } from '../GameMenu/GameMenu';
import { DaySelect, finalScore, type GameProps } from '../GameRow/GameRow';
import TeamSelect from '../TeamSelect/TeamSelect';
import TimeInput from '../TimeInput/TimeInput';
import styles from './GameCard.module.css';

// The default view, like v4's: away team and day above, home team and time
// below
const GameCard: React.FC<GameProps> = ({
    game,
    teams,
    days,
    onEdit,
    onViewInTable
}: GameProps) => {
    const { onContextMenu, menu } = useGameMenu(onViewInTable);

    return (
        <div
            className={styles.card}
            data-played={game.played || undefined}
            data-record-index={game.recordIndex}
            onContextMenu={onContextMenu}
        >
            <div className={styles.away}>
                <TeamSelect
                    label='Away team'
                    onChange={(team) =>
                        onEdit({ kind: 'team', side: 'away', team })
                    }
                    teams={teams}
                    value={game.awayTeam}
                />
            </div>
            <div className={styles.home}>
                <TeamSelect
                    label='Home team'
                    onChange={(team) =>
                        onEdit({ kind: 'team', side: 'home', team })
                    }
                    teams={teams}
                    value={game.homeTeam}
                />
            </div>
            <div className={styles.day}>
                <DaySelect days={days} game={game} onEdit={onEdit} />
            </div>
            <div className={styles.time}>
                <TimeInput
                    aria-label='Time'
                    minutes={game.timeOfDay}
                    onChange={(minutes) => onEdit({ kind: 'time', minutes })}
                />
            </div>
            <div className={styles.view}>
                <ViewInTableButton onClick={onViewInTable} />
            </div>
            {game.played && (
                <span className={styles.score}>{finalScore(game)}</span>
            )}
            {menu}
        </div>
    );
};

export default GameCard;
