import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
    SCHEDULE_DAYS,
    type ScheduleGame,
    type ScheduleTeam
} from '../../scheduleModel';
import GameRow from './GameRow';

const team = (abbreviation: string, referenceIndex: number): ScheduleTeam => ({
    key: abbreviation,
    abbreviation,
    city: abbreviation,
    nickname: abbreviation,
    referenceIndex,
    custom: true
});
const ARI = team('ARI', 0);
const ATL = team('ATL', 1);
const BAL = team('BAL', 2);

const monday = SCHEDULE_DAYS.find((d) => d.name === 'Monday')!;
const sunday = SCHEDULE_DAYS.find((d) => d.name === 'Sunday')!;

const GAME: ScheduleGame = {
    recordIndex: 7,
    homeTeam: ATL,
    awayTeam: ARI,
    day: sunday,
    timeOfDay: 13 * 60,
    homeScore: 0,
    awayScore: 0,
    played: false,
    seasonWeek: 0,
    seasonWeekType: 'RegularSeason'
};

const setup = (game: ScheduleGame = GAME) => {
    const onEdit = vi.fn();
    const onViewInTable = vi.fn();
    render(
        <GameRow
            days={SCHEDULE_DAYS}
            game={game}
            onEdit={onEdit}
            onViewInTable={onViewInTable}
            teams={[ARI, ATL, BAL]}
        />
    );
    return { onEdit, onViewInTable };
};

const row = () => document.querySelector<HTMLElement>('[data-record-index]')!;

describe('GameRow', () => {
    it('shows the game, away team first', () => {
        setup();
        expect(row()).toHaveAttribute('data-record-index', '7');
        expect(screen.getByRole('combobox', { name: 'Away team' })).toHaveValue(
            'ARI'
        );
        expect(screen.getByRole('combobox', { name: 'Home team' })).toHaveValue(
            'ATL'
        );
        expect(screen.getByRole('combobox', { name: 'Day' })).toHaveValue(
            'Sunday'
        );
        expect(screen.getByLabelText('Time')).toHaveValue('13:00');
        expect(row()).not.toHaveAttribute('data-played');
        expect(row()).not.toHaveTextContent('Final');
    });

    it('edits the away and home teams', async () => {
        const { onEdit } = setup();
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Away team' }),
            'BAL'
        );
        expect(onEdit).toHaveBeenLastCalledWith({
            kind: 'team',
            side: 'away',
            team: BAL
        });
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Home team' }),
            'BAL'
        );
        expect(onEdit).toHaveBeenLastCalledWith({
            kind: 'team',
            side: 'home',
            team: BAL
        });
    });

    it('edits the day', async () => {
        const { onEdit } = setup();
        await userEvent.selectOptions(
            screen.getByRole('combobox', { name: 'Day' }),
            'Monday'
        );
        expect(onEdit).toHaveBeenCalledWith({ kind: 'day', day: monday });
    });

    it('edits the time', async () => {
        const { onEdit } = setup();
        const input = screen.getByLabelText('Time');
        fireEvent.change(input, { target: { value: '20:20' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onEdit).toHaveBeenCalledWith({
            kind: 'time',
            minutes: 20 * 60 + 20
        });
    });

    it('shows a blank day for an unknown DayOfWeek', () => {
        const noDay: ScheduleGame = { ...GAME };
        delete noDay.day;
        setup(noDay);
        const select = screen.getByRole('combobox', { name: 'Day' });
        expect(select).toHaveValue('');
        expect(select.querySelector('option')).toHaveValue('');
    });

    it('shows the final score of a played game, away first', () => {
        setup({ ...GAME, played: true, awayScore: 24, homeScore: 17 });
        expect(row()).toHaveAttribute('data-played', 'true');
        expect(row()).toHaveTextContent('Final 24–17');
        expect(
            screen.getByRole('combobox', { name: 'Away team' })
        ).toBeEnabled();
    });

    it('views the game in the table editor from the button', async () => {
        const { onViewInTable } = setup();
        await userEvent.click(
            screen.getByRole('button', { name: 'View in table editor' })
        );
        expect(onViewInTable).toHaveBeenCalledTimes(1);
    });

    it('views the game in the table editor from the context menu', async () => {
        const { onViewInTable } = setup();
        fireEvent.contextMenu(row(), { clientX: 10, clientY: 10 });
        await userEvent.click(
            screen.getByRole('menuitem', { name: 'View in table editor' })
        );
        expect(onViewInTable).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('closes the context menu on Escape and on an outside click', async () => {
        const { onViewInTable } = setup();
        fireEvent.contextMenu(row());
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('menu')).toBeNull();

        fireEvent.contextMenu(row());
        await userEvent.click(screen.getByTestId('game-menu-underlay'));
        expect(screen.queryByRole('menu')).toBeNull();
        expect(onViewInTable).not.toHaveBeenCalled();
    });
});
