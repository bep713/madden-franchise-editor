import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabHistory } from '@renderer/tabs/tabHistory';
import HistoryButtons from './HistoryButtons';
import { HOLD_MS } from './useHoldToOpen';

const at = (tableId: number) => ({ tableId, selection: { row: 0, col: 0 } });

// 4096 -> 4097 -> 4098 -> 4104, on 4098
const HISTORY: TabHistory = {
    entries: [at(4096), at(4097), at(4098), at(4104)],
    index: 2
};

const NAMES = new Map([
    [4096, '\u0000'],
    [4097, 'OverallPercentage'],
    [4098, 'CutDayStartEvent'],
    [4104, 'Stadium']
]);

// null: no history yet
const setup = (history: TabHistory | null = HISTORY) => {
    const onGo = vi.fn();
    render(
        <HistoryButtons
            history={history ?? undefined}
            onGo={onGo}
            tableNames={NAMES}
        />
    );
    return {
        onGo,
        back: screen.getByRole('button', { name: 'Back' }),
        forward: screen.getByRole('button', { name: 'Forward' })
    };
};

const menuRows = () =>
    screen
        .getAllByRole('menuitem')
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

const hold = (button: HTMLElement) => {
    fireEvent.pointerDown(button, { button: 0 });
    act(() => {
        vi.advanceTimersByTime(HOLD_MS);
    });
};

describe('HistoryButtons', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        // Not in jsdom; nothing under the pointer unless a test says so
        document.elementFromPoint = vi.fn(() => null);
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('disables the buttons with nowhere to go', () => {
        const { back, forward } = setup(null);
        expect(back).toBeDisabled();
        expect(forward).toBeDisabled();
    });

    it('enables the buttons from the history index', () => {
        const { back, forward } = setup({ ...HISTORY, index: 0 });
        expect(back).toBeDisabled();
        expect(forward).toBeEnabled();
        expect(back).toHaveAttribute('title', 'Back (Alt+Left)');
        expect(forward).toHaveAttribute('title', 'Forward (Alt+Right)');
    });

    it('moves one step on a click', () => {
        const { back, forward, onGo } = setup();
        fireEvent.pointerDown(back, { button: 0 });
        fireEvent.pointerUp(back, { button: 0 });
        fireEvent.click(back);
        expect(onGo).toHaveBeenLastCalledWith(1);
        fireEvent.click(forward);
        expect(onGo).toHaveBeenLastCalledWith(3);
        act(() => {
            vi.advanceTimersByTime(HOLD_MS * 2);
        });
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('opens the menu on a hold and swallows the click', () => {
        const { back, onGo } = setup();
        hold(back);
        expect(screen.getByRole('menu')).toBeInTheDocument();
        fireEvent.pointerUp(back, { button: 0 });
        fireEvent.click(back);
        expect(onGo).not.toHaveBeenCalled();
        expect(screen.getByRole('menu')).toBeInTheDocument();
    });

    it('lists back entries nearest first, unnamed tables by id only', () => {
        const { back } = setup();
        fireEvent.contextMenu(back);
        expect(menuRows()).toEqual(['4097OverallPercentage', '4096']);
        expect(screen.getAllByRole('menuitem')[0]).toHaveFocus();
    });

    it('lists forward entries on a right-click', () => {
        const { forward } = setup();
        fireEvent.contextMenu(forward);
        expect(menuRows()).toEqual(['4104Stadium']);
    });

    it('goes to a picked entry and closes the menu', () => {
        const { back, onGo } = setup();
        fireEvent.contextMenu(back);
        fireEvent.click(screen.getByRole('menuitem', { name: '4096' }));
        expect(onGo).toHaveBeenCalledWith(0);
        expect(screen.queryByRole('menu')).toBeNull();
    });

    it('picks the entry the pointer is released over after a hold', () => {
        const { back, onGo } = setup();
        hold(back);
        const item = screen.getByRole('menuitem', { name: '4096' });
        document.elementFromPoint = vi.fn(() => item);
        fireEvent.pointerUp(document, { clientX: 5, clientY: 5 });
        expect(onGo).toHaveBeenCalledWith(0);
    });

    it('closes on Esc and on the underlay', () => {
        const { back, onGo } = setup();
        fireEvent.contextMenu(back);
        fireEvent.keyDown(document, { key: 'Escape' });
        expect(screen.queryByRole('menu')).toBeNull();

        fireEvent.contextMenu(back);
        fireEvent.click(screen.getByTestId('history-menu-underlay'));
        expect(screen.queryByRole('menu')).toBeNull();
        expect(onGo).not.toHaveBeenCalled();
    });

    it('moves focus with the arrow keys', () => {
        const { back } = setup();
        fireEvent.contextMenu(back);
        const [first, second] = screen.getAllByRole('menuitem');
        fireEvent.keyDown(first, { key: 'ArrowDown' });
        expect(second).toHaveFocus();
        fireEvent.keyDown(second, { key: 'ArrowDown' });
        expect(first).toHaveFocus();
        fireEvent.keyDown(first, { key: 'ArrowUp' });
        expect(second).toHaveFocus();
    });
});
