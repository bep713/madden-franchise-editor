import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TableData } from '@shared/types';
import { calculateReferenceBinary } from '@renderer/utils/references';
import { SEASON_GAME_FIELDS, TEAM_FIELDS } from './scheduleModel';
import { useSchedule } from './useSchedule';

const SEASON_GAME_ID = 4100;
const TEAM_ID = 7000;

const ref = (row: number) => calculateReferenceBinary(TEAM_ID, row);

const teamRecords = [
    { ShortName: 'ARI', LongName: 'Arizona', DisplayName: 'Cardinals' },
    { ShortName: 'ATL', LongName: 'Atlanta', DisplayName: 'Falcons' }
];

function game(overrides: Record<string, unknown> = {}) {
    return {
        HomeTeam: ref(0),
        AwayTeam: ref(1),
        TimeOfDay: 780,
        HomeScore: 0,
        AwayScore: 0,
        SeasonWeek: 0,
        SeasonGameNum: 0,
        SeasonYear: 2,
        DayOfWeek: 'Sunday',
        SeasonWeekType: 'RegularSeason',
        IsPractice: false,
        GameStatus: 'Unplayed',
        ...overrides
    };
}

function table(
    tableId: number,
    name: string,
    records: Record<string, unknown>[],
    overrides: Partial<TableData> = {}
): TableData {
    return {
        tableId,
        uniqueId: tableId,
        header: {},
        name,
        recordCount: records.length,
        records,
        recordMeta: records.map((_, index) => ({ index, isEmpty: false })),
        emptyRecordIndices: [],
        cellErrors: {},
        headers: [],
        usingGenericSchema: false,
        ...overrides
    };
}

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

const getMetadata = vi.fn();
const findTablesByName = vi.fn();
const readTableData = vi.fn();
const writeBulkTableCells = vi.fn();
const getStartTimes = vi.fn();

let seasonGameRecords: Record<string, unknown>[];

function mockReads(
    seasonGame: () => unknown = () =>
        table(SEASON_GAME_ID, 'SeasonGame', seasonGameRecords),
    team: () => unknown = () => table(TEAM_ID, 'Team', teamRecords)
) {
    readTableData.mockImplementation(async (_f: string, id: number) =>
        id === SEASON_GAME_ID ? seasonGame() : team()
    );
}

beforeEach(() => {
    vi.resetAllMocks();
    seasonGameRecords = [
        game(),
        game({ HomeTeam: ref(1), AwayTeam: ref(0), SeasonWeek: 1 }),
        game({ IsPractice: true })
    ];
    findTablesByName.mockImplementation(async (_f: string, name: string) =>
        name === 'SeasonGame'
            ? [{ id: SEASON_GAME_ID, name, recordCount: 3 }]
            : [
                  { id: 6999, name, recordCount: 1 },
                  { id: TEAM_ID, name, recordCount: 2 }
              ]
    );
    mockReads();
    getMetadata.mockResolvedValue({ gameYear: 22 });
    getStartTimes.mockResolvedValue({ seasonYear: 2 });
    writeBulkTableCells.mockResolvedValue({
        success: true,
        results: [{ success: true, index: 0 }],
        records: [],
        emptyStates: []
    });
    window.franchiseAPI = {
        getMetadata,
        findTablesByName,
        readTableData,
        writeBulkTableCells,
        schedule: { getStartTimes }
    } as unknown as Window['franchiseAPI'];
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function renderReady(gameYear?: number) {
    const hook = renderHook(
        ({ revision }: { revision: number }) =>
            useSchedule('f1', revision, gameYear),
        { initialProps: { revision: 0 } }
    );
    await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
    return hook;
}

function readySchedule(state: ReturnType<typeof useSchedule>['state']) {
    if (state.status !== 'ready') throw new Error(`state is ${state.status}`);
    return state.schedule;
}

describe('useSchedule load', () => {
    it('loads an M22 schedule without getStartTimes', async () => {
        const { result } = await renderReady(22);
        const schedule = readySchedule(result.current.state);
        expect(schedule.seasonGameTableId).toBe(SEASON_GAME_ID);
        expect(schedule.teamTableId).toBe(TEAM_ID);
        expect(schedule.weeks).toHaveLength(28);
        expect(
            schedule.games.map((g) => [
                g.recordIndex,
                g.homeTeam.abbreviation,
                g.awayTeam.abbreviation
            ])
        ).toEqual([
            [0, 'ARI', 'ATL'],
            [1, 'ATL', 'ARI']
        ]);
        expect(getStartTimes).not.toHaveBeenCalled();
        expect(getMetadata).not.toHaveBeenCalled();
        expect(readTableData).toHaveBeenCalledWith(
            'f1',
            SEASON_GAME_ID,
            SEASON_GAME_FIELDS
        );
        expect(readTableData).toHaveBeenCalledWith('f1', TEAM_ID, TEAM_FIELDS);
    });

    it('reads the game year from metadata when it is not passed', async () => {
        await renderReady();
        expect(getMetadata).toHaveBeenCalledWith('f1');
    });

    it('filters by season year on M20', async () => {
        seasonGameRecords[1] = game({ SeasonYear: 1 });
        const { result } = await renderReady(20);
        expect(getStartTimes).toHaveBeenCalledWith('f1');
        expect(
            readySchedule(result.current.state).games.map((g) => g.recordIndex)
        ).toEqual([0]);
    });

    it('gives error/load when getStartTimes throws on M20', async () => {
        getStartTimes.mockRejectedValue(new Error('no scheduler'));
        const { result } = renderHook(() => useSchedule('f1', 0, 20));
        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toMatchObject({
            kind: 'load',
            message: expect.stringContaining('no scheduler')
        });
    });

    it('gives missing-table without a SeasonGame table', async () => {
        findTablesByName.mockResolvedValue([]);
        const { result } = renderHook(() => useSchedule('f1', 0, 22));
        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toMatchObject({ kind: 'missing-table' });
        expect(readTableData).not.toHaveBeenCalled();
    });

    it('gives missing-table without a Team table that has records', async () => {
        findTablesByName.mockImplementation(async (_f: string, name: string) =>
            name === 'SeasonGame'
                ? [{ id: SEASON_GAME_ID, name, recordCount: 3 }]
                : [{ id: 6999, name, recordCount: 1 }]
        );
        const { result } = renderHook(() => useSchedule('f1', 0, 22));
        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toMatchObject({ kind: 'missing-table' });
    });

    it('gives schema when a table uses the generic schema', async () => {
        mockReads(undefined, () =>
            table(TEAM_ID, 'Team', teamRecords, { usingGenericSchema: true })
        );
        const { result } = renderHook(() => useSchedule('f1', 0, 22));
        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toMatchObject({ kind: 'schema' });
    });

    it('gives load for a readTableData { error }', async () => {
        mockReads(() => ({ error: 'bad table' }));
        const { result } = renderHook(() => useSchedule('f1', 0, 22));
        await waitFor(() => expect(result.current.state.status).toBe('error'));
        expect(result.current.state).toMatchObject({
            kind: 'load',
            message: expect.stringContaining('bad table')
        });
    });

    it('does nothing without a fileId', () => {
        const { result } = renderHook(() => useSchedule(undefined, 0, 22));
        expect(result.current.state.status).toBe('loading');
        expect(findTablesByName).not.toHaveBeenCalled();
    });

    it('ignores a stale response after a revision bump', async () => {
        const slow = deferred<TableData>();
        const first = [game()];
        const second = [game(), game({ SeasonWeek: 3 })];
        readTableData
            .mockImplementationOnce(() => slow.promise)
            .mockImplementationOnce(async () =>
                table(TEAM_ID, 'Team', teamRecords)
            );
        const { result, rerender } = renderHook(
            ({ revision }: { revision: number }) =>
                useSchedule('f1', revision, 22),
            { initialProps: { revision: 0 } }
        );
        await waitFor(() => expect(readTableData).toHaveBeenCalledTimes(2));
        seasonGameRecords = second;
        rerender({ revision: 1 });
        await waitFor(() => expect(result.current.state.status).toBe('ready'));
        expect(readySchedule(result.current.state).games).toHaveLength(2);
        await act(async () =>
            slow.resolve(table(SEASON_GAME_ID, 'SeasonGame', first))
        );
        expect(readySchedule(result.current.state).games).toHaveLength(2);
    });

    it('keeps the ready state while a revision re-reads', async () => {
        const { result, rerender } = await renderReady(22);
        const next = deferred<TableData>();
        readTableData.mockImplementationOnce(() => next.promise);
        rerender({ revision: 1 });
        expect(result.current.state.status).toBe('ready');
        await act(async () =>
            next.resolve(table(SEASON_GAME_ID, 'SeasonGame', [game()]))
        );
        await waitFor(() =>
            expect(readySchedule(result.current.state).games).toHaveLength(1)
        );
    });

    it('reload re-reads', async () => {
        const { result } = await renderReady(22);
        const calls = readTableData.mock.calls.length;
        act(() => result.current.reload());
        await waitFor(() =>
            expect(readTableData.mock.calls.length).toBe(calls + 2)
        );
    });
});

describe('useSchedule updateGame', () => {
    it('writes the cells and updates the state before the write resolves', async () => {
        const { result } = await renderReady(22);
        const write = deferred<unknown>();
        writeBulkTableCells.mockReturnValueOnce(write.promise);
        const schedule = readySchedule(result.current.state);
        const atl = schedule.teams.find((t) => t.abbreviation === 'ATL')!;

        let pending!: Promise<void>;
        act(() => {
            pending = result.current.updateGame(0, {
                kind: 'team',
                side: 'home',
                team: atl
            });
        });
        expect(writeBulkTableCells).toHaveBeenCalledWith('f1', [
            {
                tableId: SEASON_GAME_ID,
                recordIndex: 0,
                fieldName: 'HomeTeam',
                value: ref(1)
            }
        ]);
        expect(
            readySchedule(result.current.state).games[0].homeTeam.abbreviation
        ).toBe('ATL');

        await act(async () => {
            write.resolve({
                success: true,
                results: [{ success: true, index: 0 }],
                records: [],
                emptyStates: []
            });
            await pending;
        });
        expect(result.current.writeError).toBeNull();
    });

    it('sends a time edit as TimeOfDay minutes', async () => {
        const { result } = await renderReady(22);
        await act(() =>
            result.current.updateGame(1, { kind: 'time', minutes: 1220 })
        );
        expect(writeBulkTableCells).toHaveBeenCalledWith('f1', [
            {
                tableId: SEASON_GAME_ID,
                recordIndex: 1,
                fieldName: 'TimeOfDay',
                value: 1220
            }
        ]);
        expect(readySchedule(result.current.state).games[1].timeOfDay).toBe(
            1220
        );
    });

    it.each([
        ['a failed call', { success: false, error: 'locked' }, 'locked'],
        [
            'a failed cell',
            {
                success: true,
                results: [{ success: false, index: 0, error: 'bad value' }],
                records: [],
                emptyStates: []
            },
            'bad value'
        ]
    ])('sets writeError and re-reads on %s', async (_name, response, error) => {
        const { result } = await renderReady(22);
        writeBulkTableCells.mockResolvedValueOnce(response);
        const calls = readTableData.mock.calls.length;
        await act(() =>
            result.current.updateGame(0, { kind: 'time', minutes: 1 })
        );
        expect(result.current.writeError).toBe(error);
        await waitFor(() =>
            expect(readTableData.mock.calls.length).toBe(calls + 2)
        );
        await waitFor(() =>
            expect(readySchedule(result.current.state).games[0].timeOfDay).toBe(
                780
            )
        );

        act(() => result.current.dismissWriteError());
        expect(result.current.writeError).toBeNull();
    });

    it('sets writeError when the write throws', async () => {
        const { result } = await renderReady(22);
        writeBulkTableCells.mockRejectedValueOnce(new Error('ipc down'));
        await act(() =>
            result.current.updateGame(0, { kind: 'time', minutes: 1 })
        );
        expect(result.current.writeError).toBe('ipc down');
    });
});
