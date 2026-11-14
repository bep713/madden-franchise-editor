import { useContext, useEffect, useState } from 'react';
import Close from '@assets/icons/close.svg?react';
import Button from '@renderer/components/Button/Button';
import Headline from '@renderer/components/Headline/Headline';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import useLoader from '@renderer/hooks/useLoader';
import usePreference from '@renderer/hooks/usePreference';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import GameCard from './components/GameCard/GameCard';
import GameRow from './components/GameRow/GameRow';
import ViewSwitch from './components/ViewSwitch/ViewSwitch';
import WeekBar from './components/WeekBar/WeekBar';
import {
    SCHEDULE_DAYS,
    SCHEDULE_VIEWS,
    byeTeams,
    gamesInWeek,
    type ScheduleGame,
    type ScheduleView
} from './scheduleModel';
import { useSchedule } from './useSchedule';

import styles from './ScheduleEditor.module.scss';

// A load quicker than this shows no loader, so it doesn't flash
export const LOADER_DELAY_MS = 300;

const ScheduleEditor: React.FC = () => {
    const [openFile] = useContext(FranchiseFileContext);
    const { openTableTab, selectTab } = useEditorTabs();
    const { state, updateGame, writeError, dismissWriteError, reload } =
        useSchedule(
            openFile?.fileId,
            openFile?.revision,
            openFile?.metadata.gameYear
        );
    // P1 on mount, kept across re-reads
    const [week, setWeek] = useState(0);
    const [storedView, setView] = usePreference<ScheduleView>(
        'schedule.view',
        'default'
    );
    const view: ScheduleView = SCHEDULE_VIEWS.some(
        (v) => v.value === storedView
    )
        ? storedView
        : 'default';
    const { loader, setOptions: setLoaderOptions } = useLoader({
        initialMessage: 'Loading schedule...'
    });

    const loading = state.status === 'loading';
    useEffect(() => {
        if (!loading) {
            setLoaderOptions({ show: false });
            return;
        }
        const timer = setTimeout(
            () => setLoaderOptions({ show: true }),
            LOADER_DELAY_MS
        );
        return () => clearTimeout(timer);
    }, [loading, setLoaderOptions]);

    const schedule = state.status === 'ready' ? state.schedule : undefined;

    if (!openFile) return null;

    function viewInTable(game: ScheduleGame): void {
        if (!schedule) return;
        const tableId = schedule.seasonGameTableId;
        const name =
            openFile?.tables.find((t) => t.id === tableId)?.name ??
            'SeasonGame';
        openTableTab(tableId, name, {
            selection: { row: game.recordIndex, col: 0 }
        });
    }

    const selectedWeek = schedule?.weeks[week];
    const games =
        schedule && selectedWeek
            ? gamesInWeek(schedule.games, selectedWeek)
            : [];
    const byes =
        schedule && selectedWeek ? byeTeams(schedule.games, selectedWeek) : [];
    const Game = view === 'compact' ? GameRow : GameCard;

    return (
        <div className={styles.page}>
            <Headline
                actions={
                    <ViewSwitch
                        onChange={setView}
                        value={view}
                        views={SCHEDULE_VIEWS}
                    />
                }
                size='default'
                text='Schedule'
            />
            <main className={styles.main}>
                {writeError && (
                    <div className={styles.writeError} role='alert'>
                        <p className={styles.errorText}>
                            The edit was not saved: {writeError}
                        </p>
                        <button
                            aria-label='Dismiss'
                            className={styles.dismiss}
                            onClick={dismissWriteError}
                            type='button'
                        >
                            <Close aria-hidden />
                        </button>
                    </div>
                )}
                {state.status === 'error' && (
                    <div className={styles.loadError} data-error={state.kind}>
                        <p className={styles.errorText}>{state.message}</p>
                        {state.kind === 'schema' ? (
                            <Button
                                onClick={() => selectTab(SCHEMA_MANAGEMENT_KEY)}
                                type='primary'
                            >
                                Go to Schemas
                            </Button>
                        ) : (
                            <Button onClick={reload} type='primary'>
                                Retry
                            </Button>
                        )}
                    </div>
                )}
                {schedule && (
                    <>
                        <WeekBar
                            onSelect={setWeek}
                            selected={week}
                            weeks={schedule.weeks}
                        />
                        <div className={styles.scroll}>
                            <div
                                aria-label={selectedWeek?.weekName}
                                className={
                                    view === 'compact'
                                        ? styles.rows
                                        : styles.cards
                                }
                                data-view={view}
                                role='list'
                            >
                                {games.length === 0 ? (
                                    <p className={styles.empty}>
                                        No games this week.
                                    </p>
                                ) : (
                                    games.map((game) => (
                                        <div
                                            key={game.recordIndex}
                                            role='listitem'
                                        >
                                            <Game
                                                days={SCHEDULE_DAYS}
                                                game={game}
                                                onEdit={(edit) =>
                                                    void updateGame(
                                                        game.recordIndex,
                                                        edit
                                                    )
                                                }
                                                onViewInTable={() =>
                                                    viewInTable(game)
                                                }
                                                teams={schedule.teams}
                                            />
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                        {byes.length > 0 && (
                            <p className={styles.byes} data-bye-teams>
                                Bye:{' '}
                                {byes.map((t) => t.abbreviation).join(', ')}
                            </p>
                        )}
                    </>
                )}
            </main>
            {loader}
        </div>
    );
};

export default ScheduleEditor;
