import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import TimeInput from './TimeInput';

// 8:20 PM
const MINUTES = 20 * 60 + 20;

const setup = (minutes = MINUTES) => {
    const onChange = vi.fn();
    const view = render(
        <TimeInput aria-label='Time' minutes={minutes} onChange={onChange} />
    );
    const input = screen.getByRole('textbox', { name: 'Time' });
    const rerender = (next: number) =>
        view.rerender(
            <TimeInput aria-label='Time' minutes={next} onChange={onChange} />
        );
    return { onChange, input, rerender };
};

const retype = async (input: HTMLElement, text: string) => {
    await userEvent.clear(input);
    await userEvent.type(input, text);
};

describe('TimeInput', () => {
    it('shows the time in 12-hour format', () => {
        const { input } = setup();
        expect(input).toHaveValue('8:20 PM');
    });

    it('commits a valid time on Enter', async () => {
        const { input, onChange } = setup();
        await retype(input, '1:05pm{Enter}');
        expect(onChange).toHaveBeenCalledWith(13 * 60 + 5);
        expect(input).toHaveValue('1:05 PM');
    });

    it('commits on blur', async () => {
        const { input, onChange } = setup();
        await retype(input, '20:00');
        await userEvent.tab();
        expect(onChange).toHaveBeenCalledWith(20 * 60);
        expect(input).toHaveValue('8:00 PM');
    });

    it('does not call onChange when the time is the same', async () => {
        const { input, onChange } = setup();
        await retype(input, '8:20 p{Enter}');
        expect(onChange).not.toHaveBeenCalled();
        expect(input).toHaveValue('8:20 PM');
    });

    it('flags an invalid time and reverts it on blur', async () => {
        const { input, onChange } = setup();
        await retype(input, '25:00{Enter}');
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveValue('25:00');
        await userEvent.tab();
        expect(input).toHaveValue('8:20 PM');
        expect(input).not.toHaveAttribute('aria-invalid');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('reverts on Escape', async () => {
        const { input, onChange } = setup();
        await retype(input, 'abc{Escape}');
        expect(input).toHaveValue('8:20 PM');
        expect(input).not.toHaveAttribute('aria-invalid');
        await userEvent.tab();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('follows a new value from the parent', () => {
        const { input, rerender } = setup();
        rerender(13 * 60);
        expect(input).toHaveValue('1:00 PM');
    });

    it('keeps typed text when the value changes while editing', async () => {
        const { input, rerender } = setup();
        await retype(input, '9:');
        rerender(13 * 60);
        expect(input).toHaveValue('9:');
    });
});
