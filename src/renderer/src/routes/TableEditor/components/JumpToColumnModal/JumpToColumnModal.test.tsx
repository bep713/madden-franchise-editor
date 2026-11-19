import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import JumpToColumnModal from './JumpToColumnModal';

const COLUMNS = ['FirstName', 'LongName', 'ShortName', 'Overall'];

const setup = () => {
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(
        <JumpToColumnModal
            columns={COLUMNS}
            initialRow={10}
            onClose={onClose}
            onJump={onJump}
            rowCount={100}
        />
    );
    return { onJump, onClose, user: userEvent.setup() };
};

const optionNames = () =>
    screen
        .getAllByRole('button')
        .map((b) => b.textContent)
        .filter((text) => COLUMNS.includes(text ?? ''));

describe('JumpToColumnModal', () => {
    it('opens with the column input focused and every column showing', () => {
        setup();
        expect(screen.getByLabelText('Column')).toHaveFocus();
        expect(optionNames()).toEqual(COLUMNS);
        expect(screen.getByLabelText('Row')).toHaveValue('10');
    });

    it('filters the columns by the typed text', async () => {
        const { user } = setup();
        await user.keyboard('NAME');
        expect(optionNames()).toEqual(['FirstName', 'LongName', 'ShortName']);
    });

    it('one Enter picks the highlighted column and jumps', async () => {
        const { user, onJump } = setup();
        await user.keyboard('name{ArrowDown}{Enter}');
        expect(onJump).toHaveBeenCalledTimes(1);
        expect(onJump).toHaveBeenCalledWith(10, 1);
    });

    it('Go with no column jumps to column 0', async () => {
        const { user, onJump } = setup();
        await user.click(screen.getByRole('button', { name: 'Go' }));
        expect(onJump).toHaveBeenCalledWith(10, 0);
    });

    it('uses the row input', async () => {
        const { user, onJump } = setup();
        await user.click(screen.getByRole('button', { name: 'Overall' }));
        expect(screen.getByLabelText('Column')).toHaveValue('Overall');
        const row = screen.getByLabelText('Row');
        await user.clear(row);
        await user.type(row, '52{Enter}');
        expect(onJump).toHaveBeenCalledTimes(1);
        expect(onJump).toHaveBeenCalledWith(52, 3);
    });

    it('typing after a choice clears it', async () => {
        const { user, onJump } = setup();
        await user.click(screen.getByRole('button', { name: 'Overall' }));
        await user.type(screen.getByLabelText('Column'), 'x');
        await user.click(screen.getByRole('button', { name: 'Go' }));
        expect(onJump).toHaveBeenCalledWith(10, 0);
    });

    it('closes via X and Escape', async () => {
        const { user, onClose, onJump } = setup();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(2);
        expect(onJump).not.toHaveBeenCalled();
    });
});
