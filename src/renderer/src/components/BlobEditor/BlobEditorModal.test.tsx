import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import BlobEditorModal from './BlobEditorModal';

vi.mock('../TextEditor/TextEditor', () => ({
    default: ({
        value,
        onChange
    }: {
        value?: string;
        onChange?: (v: string) => void;
    }) => (
        <textarea
            aria-label='json'
            onChange={(e) => onChange?.(e.target.value)}
            value={value}
        />
    )
}));

const setup = (value: unknown) => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    render(
        <BlobEditorModal onApply={onApply} onClose={onClose} value={value} />
    );
    return { onApply, onClose, user: userEvent.setup() };
};

const replaceText = async (
    user: ReturnType<typeof userEvent.setup>,
    text: string
) => {
    const box = screen.getByLabelText('json');
    await user.clear(box);
    await user.click(box);
    await user.paste(text);
};

describe('BlobEditorModal', () => {
    it('pretty-prints the JSON', () => {
        setup('{"a":1}');
        expect(screen.getByLabelText('json')).toHaveValue('{\n  "a": 1\n}');
    });

    it('falls back to {} for unparsable values', () => {
        setup('not json');
        expect(screen.getByLabelText('json')).toHaveValue('{}');
    });

    it('applies minified JSON', async () => {
        const { user, onApply } = setup('{}');
        await replaceText(user, '{ "a": [1, 2] }');
        await user.click(screen.getByRole('button', { name: 'Apply Changes' }));
        expect(onApply).toHaveBeenCalledWith('{"a":[1,2]}');
    });

    it('shows an error and does not apply invalid JSON', async () => {
        const { user, onApply } = setup('{}');
        await replaceText(user, '{ nope');
        await user.click(screen.getByRole('button', { name: 'Apply Changes' }));
        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(onApply).not.toHaveBeenCalled();
    });

    it('applies on underlay click', async () => {
        const { user, onApply } = setup('{"a":1}');
        await user.click(screen.getByTestId('modal-underlay'));
        expect(onApply).toHaveBeenCalledWith('{"a":1}');
    });

    it('Escape closes without applying', async () => {
        const { user, onApply, onClose } = setup('{}');
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalled();
        expect(onApply).not.toHaveBeenCalled();
    });
});
