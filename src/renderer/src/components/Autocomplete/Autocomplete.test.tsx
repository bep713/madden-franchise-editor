import { useMemo, useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import Autocomplete from './Autocomplete';

const OPTIONS = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
    { value: 'c', label: 'Gamma' }
];

// Filters by the typed text, like the real callers
const Harness = ({
    autoFocus,
    initialShow = true,
    onOptionSelect
}: {
    autoFocus?: boolean;
    initialShow?: boolean;
    onOptionSelect: (option: { value: string }) => void;
}) => {
    const [text, setText] = useState('');
    const [show, setShow] = useState(initialShow);
    const options = useMemo(
        () =>
            OPTIONS.filter((o) =>
                o.label.toLowerCase().includes(text.toLowerCase())
            ),
        [text]
    );
    return (
        <Autocomplete
            autoFocus={autoFocus}
            label='Field'
            onOptionSelect={onOptionSelect}
            onShowOptionsChange={setShow}
            onTextChange={setText}
            options={options}
            showOptions={show}
            text={text}
        />
    );
};

const setup = (props: { autoFocus?: boolean; initialShow?: boolean } = {}) => {
    const onOptionSelect = vi.fn();
    render(<Harness onOptionSelect={onOptionSelect} {...props} />);
    return { onOptionSelect, user: userEvent.setup() };
};

const highlighted = () =>
    screen
        .getAllByRole('button')
        .filter((b) => b.className.includes('highlighted'))
        .map((b) => b.textContent);

describe('Autocomplete keyboard', () => {
    it('moves the highlight with the arrows, clamped at both ends', async () => {
        const { user } = setup({ autoFocus: true });
        expect(highlighted()).toEqual(['Alpha']);
        await user.keyboard('{ArrowUp}');
        expect(highlighted()).toEqual(['Alpha']);
        await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
        expect(highlighted()).toEqual(['Gamma']);
        await user.keyboard('{ArrowUp}');
        expect(highlighted()).toEqual(['Beta']);
    });

    it('Enter picks the highlighted option', async () => {
        const { user, onOptionSelect } = setup({ autoFocus: true });
        await user.keyboard('{ArrowDown}{Enter}');
        expect(onOptionSelect).toHaveBeenCalledWith(OPTIONS[1]);
    });

    it('Enter does nothing while the list is closed, and an arrow opens it', async () => {
        const { user, onOptionSelect } = setup({
            autoFocus: true,
            initialShow: false
        });
        await user.keyboard('{Enter}');
        expect(onOptionSelect).not.toHaveBeenCalled();
        await user.keyboard('{ArrowDown}');
        expect(highlighted()).toEqual(['Alpha']);
    });

    it('resets the highlight when the options change', async () => {
        const { user, onOptionSelect } = setup({ autoFocus: true });
        await user.keyboard('{ArrowDown}{ArrowDown}');
        await user.keyboard('a');
        expect(highlighted()).toEqual(['Alpha']);
        await user.keyboard('m{Enter}');
        expect(onOptionSelect).toHaveBeenCalledWith(OPTIONS[2]);
    });

    it('autoFocus focuses the input', () => {
        setup({ autoFocus: true });
        expect(screen.getByLabelText('Field')).toHaveFocus();
    });
});
