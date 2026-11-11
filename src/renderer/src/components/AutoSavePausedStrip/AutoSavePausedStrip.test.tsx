import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import AutoSavePausedStrip from './AutoSavePausedStrip';

describe('AutoSavePausedStrip', () => {
    it('names the file and calls onReload and onBranch', async () => {
        const onReload = vi.fn();
        const onBranch = vi.fn();
        render(
            <AutoSavePausedStrip
                fileName='CAREER-TEST'
                onBranch={onBranch}
                onReload={onReload}
            />
        );

        expect(screen.getByRole('status').textContent).toContain(
            'Auto-save is paused: CAREER-TEST was changed outside the editor.'
        );
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();

        await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
        expect(onReload).toHaveBeenCalledTimes(1);
        await userEvent.click(
            screen.getByRole('button', { name: 'Branch and save new' })
        );
        expect(onBranch).toHaveBeenCalledTimes(1);
    });
});
