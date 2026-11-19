import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import ReferenceEditor from './ReferenceEditor';

const tables = [
    { id: 4141, name: 'StadiumPartInfo' },
    { id: 4146, name: 'SeasonGame' }
];
const anchorRect = { top: 10, bottom: 30, left: 10, width: 100, height: 20 };
const VALUE = '00100000010110100000000000010010';
const VALUE_4146_25 = '00100000011001000000000000011001';

const setup = () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
        <ReferenceEditor
            anchorRect={anchorRect}
            onChange={onChange}
            onClose={onClose}
            tables={tables}
            value={VALUE}
        />
    );
    return { onChange, onClose, user: userEvent.setup() };
};

describe('ReferenceEditor', () => {
    it('initialises fields from the value', () => {
        setup();
        expect(screen.getByLabelText('Table')).toHaveValue(
            '4141 - StadiumPartInfo'
        );
        expect(screen.getByLabelText('Row Index')).toHaveValue(18);
        expect(screen.getByLabelText('Binary')).toHaveValue(VALUE);
    });

    it('recomputes the binary when table and row change', async () => {
        const { user } = setup();
        await user.clear(screen.getByLabelText('Table'));
        await user.type(screen.getByLabelText('Table'), '4146');
        await user.click(
            screen.getByRole('button', { name: '4146 - SeasonGame' })
        );
        const row = screen.getByLabelText('Row Index');
        await user.clear(row);
        await user.type(row, '25');
        expect(screen.getByLabelText('Binary')).toHaveValue(VALUE_4146_25);
        expect(screen.getByLabelText('Table')).toHaveValue('4146 - SeasonGame');
    });

    it('updates table and row from a typed binary', async () => {
        const { user } = setup();
        const binary = screen.getByLabelText('Binary');
        await user.clear(binary);
        await user.type(binary, VALUE_4146_25);
        expect(screen.getByLabelText('Table')).toHaveValue('4146 - SeasonGame');
        expect(screen.getByLabelText('Row Index')).toHaveValue(25);
    });

    it('Change calls onChange and stays open', async () => {
        const { user, onChange, onClose } = setup();
        await user.click(screen.getByRole('button', { name: 'Change' }));
        expect(onChange).toHaveBeenCalledWith(VALUE);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes via X, underlay and Escape', async () => {
        const { user, onClose } = setup();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        await user.click(screen.getByTestId('reference-editor-underlay'));
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('toggles the table options with the caret and closes them on an outside click', async () => {
        const { user, onClose } = setup();
        const option = () =>
            screen.queryByRole('button', { name: '4146 - SeasonGame' });
        const caret = screen.getByRole('button', { name: 'Toggle options' });

        await user.click(caret);
        expect(option()).toBeInTheDocument();
        expect(screen.getByLabelText('Table')).toHaveFocus();
        await user.click(caret);
        expect(option()).not.toBeInTheDocument();

        await user.click(screen.getByLabelText('Table'));
        expect(option()).toBeInTheDocument();
        await user.click(screen.getByText('Edit cell reference'));
        expect(option()).not.toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('toggles the table options with the label', async () => {
        const { user } = setup();
        const option = () =>
            screen.queryByRole('button', { name: '4146 - SeasonGame' });
        await user.click(screen.getByText('Table'));
        expect(option()).toBeInTheDocument();
        expect(screen.getByLabelText('Table')).toHaveFocus();
        await user.click(screen.getByText('Table'));
        expect(option()).not.toBeInTheDocument();
    });

    it.each([
        ['the input', () => screen.getByLabelText('Table')],
        [
            'the caret',
            () => screen.getByRole('button', { name: 'Toggle options' })
        ],
        ['the label', () => screen.getByText('Table')]
    ])('selects the table text when opened by %s', async (_, target) => {
        const { user } = setup();
        await user.click(target());
        const input = screen.getByLabelText<HTMLInputElement>('Table');
        expect(input.selectionStart).toBe(0);
        expect(input.selectionEnd).toBe('4141 - StadiumPartInfo'.length);

        // typing replaces the selected text
        await user.keyboard('4146');
        expect(input).toHaveValue('4146');
    });
});
