import { fireEvent, render, screen } from '@testing-library/react';
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
    const input = screen.getByLabelText<HTMLInputElement>('Time');
    const rerender = (next: number) =>
        view.rerender(
            <TimeInput aria-label='Time' minutes={next} onChange={onChange} />
        );
    return { onChange, input, rerender };
};

// jsdom has no time picker: set the value as the picker would
const pick = (input: HTMLInputElement, value: string) => {
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value } });
};

describe('TimeInput', () => {
    it('is a native time input with the time as HH:mm', () => {
        const { input } = setup();
        expect(input.type).toBe('time');
        expect(input).toHaveValue('20:20');
    });

    it('commits on Enter, not on change', async () => {
        const { input, onChange } = setup();
        pick(input, '13:05');
        expect(onChange).not.toHaveBeenCalled();
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(onChange).toHaveBeenCalledWith(13 * 60 + 5);
    });

    it('commits on blur', () => {
        const { input, onChange } = setup();
        pick(input, '20:00');
        fireEvent.blur(input);
        expect(onChange).toHaveBeenCalledWith(20 * 60);
    });

    it('does not call onChange when the time is the same', () => {
        const { input, onChange } = setup();
        pick(input, '20:20');
        fireEvent.keyDown(input, { key: 'Enter' });
        fireEvent.blur(input);
        expect(onChange).not.toHaveBeenCalled();
    });

    it('reverts a cleared time on blur and writes nothing', () => {
        const { input, onChange } = setup();
        pick(input, '');
        fireEvent.blur(input);
        expect(input).toHaveValue('20:20');
        expect(onChange).not.toHaveBeenCalled();
    });

    it('reverts on Escape', async () => {
        const { input, onChange } = setup();
        pick(input, '09:00');
        fireEvent.keyDown(input, { key: 'Escape' });
        expect(input).toHaveValue('20:20');
        await userEvent.tab();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('follows a new value from the parent', () => {
        const { input, rerender } = setup();
        rerender(13 * 60);
        expect(input).toHaveValue('13:00');
    });

    it('keeps a changed value when the parent value changes while editing', () => {
        const { input, rerender } = setup();
        pick(input, '09:00');
        rerender(13 * 60);
        expect(input).toHaveValue('09:00');
    });
});
