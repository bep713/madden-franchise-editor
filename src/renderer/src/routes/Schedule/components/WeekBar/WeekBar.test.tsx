import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SCHEDULE_WEEKS } from '../../scheduleModel';
import WeekBar from './WeekBar';

const counts = SCHEDULE_WEEKS.map((week) => (week.index === 4 ? 16 : 0));

const setup = (selected = 0) => {
    const onSelect = vi.fn();
    const view = render(
        <WeekBar
            counts={counts}
            onSelect={onSelect}
            selected={selected}
            weeks={SCHEDULE_WEEKS}
        />
    );
    return { onSelect, rerender: view.rerender };
};

const week = (index: number) =>
    document.querySelector<HTMLElement>(`[data-week="${index}"]`)!;

describe('WeekBar', () => {
    it('shows every week in order', () => {
        setup();
        const buttons = screen.getAllByRole('button');
        expect(buttons).toHaveLength(28);
        expect(buttons[0]).toHaveTextContent('P1');
        expect(buttons.map((b) => b.title)).toEqual(
            SCHEDULE_WEEKS.map((w) => w.weekName)
        );
    });

    it('marks the selected week', () => {
        setup(2);
        expect(week(2)).toHaveAttribute('aria-pressed', 'true');
        expect(week(0)).toHaveAttribute('aria-pressed', 'false');
        expect(week(2).tabIndex).toBe(0);
        expect(week(0).tabIndex).toBe(-1);
    });

    it('calls onSelect on click', async () => {
        const { onSelect } = setup();
        await userEvent.click(week(5));
        expect(onSelect).toHaveBeenCalledWith(5);
    });

    it('shows the game count only when there are games', () => {
        setup();
        expect(week(4).querySelector('[data-count]')).toHaveTextContent('16');
        expect(week(0).querySelector('[data-count]')).toBeNull();
    });

    it('moves the selection with the arrow keys', () => {
        const { onSelect } = setup(3);
        fireEvent.keyDown(week(3), { key: 'ArrowRight' });
        expect(onSelect).toHaveBeenLastCalledWith(4);
        fireEvent.keyDown(week(3), { key: 'ArrowLeft' });
        expect(onSelect).toHaveBeenLastCalledWith(2);
    });

    it('stops at the ends', () => {
        const { onSelect } = setup(0);
        fireEvent.keyDown(week(0), { key: 'ArrowLeft' });
        expect(onSelect).not.toHaveBeenCalled();
    });
});
