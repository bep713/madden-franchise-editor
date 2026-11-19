import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReadTableDataResult, TableData } from '@shared/types';
import {
    SCHEDULE_WEEKS,
    SEASON_GAME_FIELDS,
    TEAM_FIELDS,
    applyGameEdit,
    buildGames,
    buildTeams,
    editWrites,
    type GameEdit,
    type Schedule
} from './scheduleModel';

export type ScheduleErrorKind = 'schema' | 'missing-table' | 'load';

export type ScheduleState =
    | { status: 'loading' }
    | { status: 'ready'; schedule: Schedule }
    | { status: 'error'; kind: ScheduleErrorKind; message: string };

export interface UseScheduleResult {
    state: ScheduleState;
    // Optimistic; on failure re-reads and sets writeError
    updateGame: (recordIndex: number, edit: GameEdit) => Promise<void>;
    writeError: string | null;
    dismissWriteError: () => void;
    reload: () => void;
}

class ScheduleLoadError extends Error {
    constructor(
        readonly kind: ScheduleErrorKind,
        message: string
    ) {
        super(message);
    }
}

function errorText(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}

function tableData(result: ReadTableDataResult, name: string): TableData {
    if ('error' in result) {
        throw new ScheduleLoadError(
            'load',
            `Could not read the ${name} table: ${result.error}`
        );
    }
    return result;
}

async function loadSchedule(
    fileId: string,
    knownGameYear: number | undefined
): Promise<Schedule> {
    const api = window.franchiseAPI;
    const gameYear = knownGameYear ?? (await api.getMetadata(fileId))?.gameYear;
    if (gameYear === undefined) {
        throw new ScheduleLoadError('load', 'Could not read the file.');
    }

    const [seasonGameTables, teamTables] = await Promise.all([
        api.findTablesByName(fileId, 'SeasonGame'),
        api.findTablesByName(fileId, 'Team')
    ]);
    if ('error' in seasonGameTables) {
        throw new ScheduleLoadError('load', seasonGameTables.error);
    }
    if ('error' in teamTables) {
        throw new ScheduleLoadError('load', teamTables.error);
    }
    const seasonGameTable = seasonGameTables[0];
    const teamTable = teamTables.find((t) => t.recordCount > 1);
    if (!seasonGameTable || !teamTable) {
        throw new ScheduleLoadError(
            'missing-table',
            `This file has no ${seasonGameTable ? 'Team' : 'SeasonGame'} table.`
        );
    }

    const [seasonGameResult, teamResult] = await Promise.all([
        api.readTableData(fileId, seasonGameTable.id, SEASON_GAME_FIELDS),
        api.readTableData(fileId, teamTable.id, TEAM_FIELDS)
    ]);
    const seasonGame = tableData(seasonGameResult, 'SeasonGame');
    const team = tableData(teamResult, 'Team');
    if (seasonGame.usingGenericSchema || team.usingGenericSchema) {
        throw new ScheduleLoadError(
            'schema',
            'The schema for this file is missing, so the schedule cannot be read.'
        );
    }

    let seasonYear: number | undefined;
    if (gameYear < 21) {
        try {
            seasonYear = (await api.schedule.getStartTimes(fileId)).seasonYear;
        } catch (e) {
            throw new ScheduleLoadError(
                'load',
                `Could not read the season year: ${errorText(e)}`
            );
        }
    }

    const teams = buildTeams(team.records, team.emptyRecordIndices);
    const { games, skipped } = buildGames({
        seasonGameRecords: seasonGame.records,
        emptyIndices: seasonGame.emptyRecordIndices,
        teams,
        teamTableId: team.tableId,
        gameYear,
        seasonYear
    });
    if (skipped > 0) {
        console.warn(
            `Schedule: ${skipped} game(s) reference a team outside the Team table and are hidden`
        );
    }

    return {
        teams,
        games,
        weeks: [...SCHEDULE_WEEKS],
        seasonGameTableId: seasonGame.tableId,
        teamTableId: team.tableId
    };
}

// Re-reads on a fileId/revision change, keeping the previous schedule of the
// same file on screen until the new one arrives. A response for a superseded
// load is dropped.
export function useSchedule(
    fileId: string | undefined,
    revision: number | undefined,
    gameYear?: number
): UseScheduleResult {
    const [state, setState] = useState<ScheduleState>({ status: 'loading' });
    const [writeError, setWriteError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const requestId = useRef(0);

    // Reset during render rather than in the effect. Only a new file, or a
    // load that isn't showing a schedule, goes back to loading.
    const [loadedFile, setLoadedFile] = useState(fileId);
    const request = `${fileId}#${revision}#${attempt}`;
    const [started, setStarted] = useState(request);
    if (started !== request) {
        setStarted(request);
        if (loadedFile !== fileId || state.status !== 'ready') {
            setLoadedFile(fileId);
            setState({ status: 'loading' });
        }
    }

    useEffect(() => {
        if (!fileId) return;
        const id = ++requestId.current;
        loadSchedule(fileId, gameYear)
            .then((schedule) => {
                if (id === requestId.current) {
                    setState({ status: 'ready', schedule });
                }
            })
            .catch((e: unknown) => {
                if (id !== requestId.current) return;
                setState({
                    status: 'error',
                    kind: e instanceof ScheduleLoadError ? e.kind : 'load',
                    message: errorText(e)
                });
            });
    }, [fileId, gameYear, revision, attempt]);

    const reload = useCallback(() => setAttempt((a) => a + 1), []);

    const updateGame = useCallback(
        async (recordIndex: number, edit: GameEdit): Promise<void> => {
            if (!fileId || state.status !== 'ready') return;
            const { schedule } = state;
            const game = schedule.games.find(
                (g) => g.recordIndex === recordIndex
            );
            if (!game) return;

            const writes = editWrites(schedule, game, edit);
            const updated = applyGameEdit(game, edit);
            setState((s) =>
                s.status === 'ready'
                    ? {
                          status: 'ready',
                          schedule: {
                              ...s.schedule,
                              games: s.schedule.games.map((g) =>
                                  g.recordIndex === recordIndex ? updated : g
                              )
                          }
                      }
                    : s
            );

            let failure: string | null = null;
            try {
                const result = await window.franchiseAPI.writeBulkTableCells(
                    fileId,
                    writes
                );
                if (!result.success) {
                    failure = result.error;
                } else {
                    const failed = result.results.find((r) => !r.success);
                    if (failed) {
                        failure = failed.error ?? 'The edit was not saved.';
                    }
                }
            } catch (e) {
                failure = errorText(e);
            }
            if (failure !== null) {
                setWriteError(failure);
                reload();
            }
        },
        [fileId, state, reload]
    );

    const dismissWriteError = useCallback(() => setWriteError(null), []);

    return { state, updateGame, writeError, dismissWriteError, reload };
}
