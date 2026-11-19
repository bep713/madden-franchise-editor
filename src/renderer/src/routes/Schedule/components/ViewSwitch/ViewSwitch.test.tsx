import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SCHEDULE_VIEWS } from '../../scheduleModel';
import ViewSwitch from './ViewSwitch';

const setup = () => {
    const onChange = vi.fn();
    render(
        <ViewSwitch
            onChange={onChange}
            value='default'
            views={SCHEDULE_VIEWS}
        />
    );
    return { onChange };
};

describe('ViewSwitch', () => {
    it('marks the current view', () => {
        setup();
        expect(screen.getByRole('group', { name: 'View' })).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Default', pressed: true })
        ).toBeTruthy();
        expect(
            screen.getByRole('button', { name: 'Table', pressed: false })
        ).toBeTruthy();
    });

    it('calls onChange with another view only', async () => {
        const { onChange } = setup();
        await userEvent.click(screen.getByRole('button', { name: 'Default' }));
        expect(onChange).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole('button', { name: 'Table' }));
        expect(onChange).toHaveBeenCalledWith('compact');
    });
});
