import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Checkbox from './Checkbox';

describe('Checkbox', () => {
    it('is named by its label and reports the new value', async () => {
        const onChange = vi.fn();
        render(
            <Checkbox checked label='Add default schemas' onChange={onChange} />
        );
        const box = screen.getByRole('checkbox', {
            name: /Add default schemas/
        });
        expect((box as HTMLInputElement).checked).toBe(true);
        await userEvent.click(box);
        expect(onChange).toHaveBeenCalledWith(false);
    });

    it('toggles from its description too', async () => {
        const onChange = vi.fn();
        render(
            <Checkbox
                checked={false}
                description='More text'
                label='Option'
                onChange={onChange}
            />
        );
        await userEvent.click(screen.getByText('More text'));
        expect(onChange).toHaveBeenCalledWith(true);
    });

    it('ignores clicks when disabled', async () => {
        const onChange = vi.fn();
        render(
            <Checkbox
                checked={false}
                disabled
                label='Option'
                onChange={onChange}
            />
        );
        await userEvent.click(screen.getByRole('checkbox'));
        expect(onChange).not.toHaveBeenCalled();
    });
});
