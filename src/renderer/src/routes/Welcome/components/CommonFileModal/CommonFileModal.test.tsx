import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import CommonFileModal from './CommonFileModal';
import {
    fieldDefault,
    fieldOptions,
    TYPE_KEY,
    YEAR_KEY
} from './commonFileOptions';

const setup = (initialRemember?: boolean, reopenWarning?: boolean) => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(
        <CommonFileModal
            initialRemember={initialRemember}
            initialType='madden'
            initialYear='22'
            onClose={onClose}
            onConfirm={onConfirm}
            reopenWarning={reopenWarning}
        />
    );
    return { onConfirm, onClose, user: userEvent.setup() };
};

const optionValues = (label: string) =>
    Array.from((screen.getByLabelText(label) as HTMLSelectElement).options).map(
        (o) => o.value
    );

describe('commonFileOptions', () => {
    it('reads the FTC fields of the preferences schema', () => {
        expect(fieldOptions(YEAR_KEY).map((o) => o.value)).toContain('27');
        expect(fieldOptions(TYPE_KEY).map((o) => o.value)).toEqual([
            'madden',
            'college'
        ]);
        expect(fieldDefault(YEAR_KEY)).toBe('22');
        expect(fieldDefault(TYPE_KEY)).toBe('madden');
    });
});

describe('CommonFileModal', () => {
    it('lists the schema options and preselects the initial values', () => {
        setup();
        expect(optionValues('Game Year')).toEqual(
            fieldOptions(YEAR_KEY).map((o) => o.value)
        );
        expect(optionValues('Game Type')).toEqual(['madden', 'college']);
        expect(screen.getByLabelText('Game Year')).toHaveValue('22');
        expect(screen.getByLabelText('Game Type')).toHaveValue('madden');
        expect(
            screen.getByLabelText('Remember my choices for this file')
        ).not.toBeChecked();
    });

    it('confirms with a numeric year, the type and the remember box', async () => {
        const { onConfirm, user } = setup();
        await user.selectOptions(screen.getByLabelText('Game Year'), '27');
        await user.selectOptions(screen.getByLabelText('Game Type'), 'college');
        await user.click(
            screen.getByLabelText('Remember my choices for this file')
        );
        await user.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
            gameYear: 27,
            gameType: 'college',
            remember: true
        });
    });

    it('starts ticked for a remembered file', async () => {
        const { onConfirm, user } = setup(true);
        const remember = screen.getByLabelText(
            'Remember my choices for this file'
        );
        expect(remember).toBeChecked();
        await user.click(remember);
        await user.click(screen.getByRole('button', { name: 'Confirm' }));
        expect(onConfirm).toHaveBeenCalledExactlyOnceWith({
            gameYear: 22,
            gameType: 'madden',
            remember: false
        });
    });

    it('warns about unsaved changes only when re-opening', () => {
        setup();
        expect(screen.queryByText(/re-opens the file/)).toBeNull();
    });

    it('shows the re-open warning', () => {
        setup(false, true);
        expect(
            screen.getByText(
                'Changing these re-opens the file. Unsaved changes will be lost.'
            )
        ).toBeInTheDocument();
    });

    it('closes on Escape', async () => {
        const { onClose, onConfirm, user } = setup();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledOnce();
        expect(onConfirm).not.toHaveBeenCalled();
    });

    it('closes on X', async () => {
        const { onClose, user } = setup();
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledOnce();
    });
});
