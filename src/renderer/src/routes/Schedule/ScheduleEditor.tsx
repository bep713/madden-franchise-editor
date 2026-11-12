import { useContext, useEffect, useMemo, useState } from 'react';
import Close from '@assets/icons/close.svg?react';
import Button from '@renderer/components/Button/Button';
import Headline from '@renderer/components/Headline/Headline';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import useLoader from '@renderer/hooks/useLoader';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import GameRow from './components/GameRow/GameRow';
import WeekBar from './components/WeekBar/WeekBar';
import {
    SCHEDULE_DAYS,
    gamesInWeek,
    weekGameCounts,
    type ScheduleGame
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
    const counts = useMemo(
        () => (schedule ? weekGameCounts(schedule.games, schedule.weeks) : []),
        [schedule]
    );

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

    return (
        <div className={styles.page}>
            <main className={styles.main}>
                <Headline size='default' text='Schedule' />
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
                            counts={counts}
                            onSelect={setWeek}
                            selected={week}
                            weeks={schedule.weeks}
                        />
                        <div
                            aria-label={selectedWeek?.weekName}
                            className={styles.games}
                            role='list'
                        >
                            {games.length === 0 ? (
                                <p className={styles.empty}>
                                    No games this week.
                                </p>
                            ) : (
                                games.map((game) => (
                                    <div key={game.recordIndex} role='listitem'>
                                        <GameRow
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
                    </>
                )}
            </main>
            {loader}
        </div>
    );
};

export default ScheduleEditor;
