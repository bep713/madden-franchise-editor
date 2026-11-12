import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMetadata } from '@shared/types';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import {
    EditorTabsContext,
    EditorTabsValue
} from '@renderer/tabs/EditorTabsContext';
import type { ScheduleGame, ScheduleTeam } from './scheduleModel';
import { SCHEDULE_WEEKS } from './scheduleModel';
import type { UseScheduleResult } from './useSchedule';
import ScheduleEditor, { LOADER_DELAY_MS } from './ScheduleEditor';

// The hook has its own tests (useSchedule.test.tsx)
const useScheduleMock = vi.fn<(...args: unknown[]) => UseScheduleResult>();
vi.mock('./useSchedule', () => ({
    useSchedule: (...args: unknown[]) => useScheduleMock(...args)
}));

const SEASON_GAME_ID = 4100;

function team(abbreviation: string, referenceIndex: number): ScheduleTeam {
    return {
        key: abbreviation,
        abbreviation,
        city: abbreviation,
        nickname: abbreviation,
        referenceIndex,
        custom: true
    };
}
const TEAMS = [team('ARI', 0), team('ATL', 1), team('BAL', 2)];

function game(recordIndex: number, seasonWeek: number): ScheduleGame {
    return {
        recordIndex,
        homeTeam: TEAMS[0],
        awayTeam: TEAMS[recordIndex % 2 ? 1 : 2],
        day: { name: 'Sunday', abbreviation: 'Sun' },
        timeOfDay: 780,
        homeScore: 0,
        awayScore: 0,
        played: false,
        seasonWeek,
        seasonWeekType: 'PreSeason'
    };
}
// Two in P1, one in P2
const GAMES = [game(0, 0), game(1, 0), game(5, 1)];

const updateGame = vi.fn(async () => undefined);
const dismissWriteError = vi.fn();
const reload = vi.fn();

function hookResult(
    overrides: Partial<UseScheduleResult> = {}
): UseScheduleResult {
    return {
        state: {
            status: 'ready',
            schedule: {
                teams: TEAMS,
                games: GAMES,
                weeks: [...SCHEDULE_WEEKS],
                seasonGameTableId: SEASON_GAME_ID,
                teamTableId: 7000
            }
        },
        updateGame,
        writeError: null,
        dismissWriteError,
        reload,
        ...overrides
    };
}

const FILE: OpenFranchiseFile = {
    fileId: 'file-1',
    metadata: { gameYear: 22 } as FileMetadata,
    tables: [
        {
            id: SEASON_GAME_ID,
            name: 'SeasonGame',
            index: 3
        } as OpenFranchiseFile['tables'][number]
    ],
    revision: 2
};

const openTableTab = vi.fn();
const selectTab = vi.fn();

// null: no file open
function renderEditor(file: OpenFranchiseFile | null = FILE) {
    return render(
        <FranchiseFileContext.Provider value={[file ?? undefined, undefined]}>
            <EditorTabsContext.Provider
                value={
                    { openTableTab, selectTab } as unknown as EditorTabsValue
                }
            >
                <ScheduleEditor />
            </EditorTabsContext.Provider>
        </FranchiseFileContext.Provider>
    );
}

const rows = () =>
    Array.from(document.querySelectorAll('[data-record-index]')).map((row) =>
        Number(row.getAttribute('data-record-index'))
    );

beforeEach(() => {
    vi.clearAllMocks();
    useScheduleMock.mockReturnValue(hookResult());
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ScheduleEditor', () => {
    it('reads the open file', () => {
        renderEditor();
        expect(useScheduleMock).toHaveBeenCalledWith('file-1', 2, 22);
    });

    it("shows P1's games, and another week's when clicked", async () => {
        renderEditor();
        expect(screen.getByRole('heading', { name: 'Schedule' })).toBeTruthy();
        expect(
            screen.getByRole('button', { name: /^P1/, pressed: true })
        ).toBeTruthy();
        expect(rows()).toEqual([0, 1]);

        await userEvent.click(screen.getByRole('button', { name: /^P2/ }));
        expect(rows()).toEqual([5]);
    });

    it('says when a week has no games', async () => {
        renderEditor();
        await userEvent.click(screen.getByRole('button', { name: /^P3/ }));
        expect(rows()).toEqual([]);
        expect(screen.getByText('No games this week.')).toBeTruthy();
    });

    it("passes a row's edit to updateGame with its record index", async () => {
        renderEditor();
        const row = document.querySelector<HTMLElement>(
            '[data-record-index="1"]'
        )!;
        await userEvent.selectOptions(
            within(row).getByRole('combobox', { name: 'Home team' }),
            'BAL'
        );
        expect(updateGame).toHaveBeenCalledWith(1, {
            kind: 'team',
            side: 'home',
            team: TEAMS[2]
        });
    });

    it('shows a dismissible write error', async () => {
        useScheduleMock.mockReturnValue(hookResult({ writeError: 'boom' }));
        renderEditor();
        expect(screen.getByRole('alert').textContent).toContain('boom');
        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
        expect(dismissWriteError).toHaveBeenCalled();
    });

    it('links a schema error to Schemas', async () => {
        useScheduleMock.mockReturnValue(
            hookResult({
                state: { status: 'error', kind: 'schema', message: 'No schema' }
            })
        );
        renderEditor();
        expect(screen.getByText('No schema')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
        await userEvent.click(
            screen.getByRole('button', { name: 'Go to Schemas' })
        );
        expect(selectTab).toHaveBeenCalledWith('schema-management');
    });

    it.each(['missing-table', 'load'] as const)(
        'retries a %s error',
        async (kind) => {
            useScheduleMock.mockReturnValue(
                hookResult({ state: { status: 'error', kind, message: 'x' } })
            );
            renderEditor();
            await userEvent.click(
                screen.getByRole('button', { name: 'Retry' })
            );
            expect(reload).toHaveBeenCalled();
        }
    );

    it('opens the game in a SeasonGame table tab', async () => {
        renderEditor();
        const row = document.querySelector<HTMLElement>(
            '[data-record-index="1"]'
        )!;
        await userEvent.click(
            within(row).getByRole('button', { name: 'View in table editor' })
        );
        expect(openTableTab).toHaveBeenCalledWith(
            SEASON_GAME_ID,
            'SeasonGame',
            { selection: { row: 1, col: 0 } }
        );
    });

    it('shows the loader only after a delay', () => {
        vi.useFakeTimers();
        useScheduleMock.mockReturnValue(
            hookResult({ state: { status: 'loading' } })
        );
        renderEditor();
        expect(screen.queryByText('Loading schedule...')).toBeNull();
        act(() => {
            vi.advanceTimersByTime(LOADER_DELAY_MS);
        });
        expect(screen.getByText('Loading schedule...')).toBeTruthy();
    });

    it('renders nothing without a file', () => {
        const { container } = renderEditor(null);
        expect(container.innerHTML).toBe('');
    });
});
