import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GetReferencesResult, RecordReference } from '@shared/types';
import ReferencesModal from './ReferencesModal';

const REFERENCES: RecordReference[] = [
    {
        tableId: 4220,
        name: 'Player',
        recordIndex: 3,
        fieldName: 'Team',
        fieldIndex: 2
    },
    {
        tableId: 4220,
        name: 'Player',
        recordIndex: 8,
        fieldName: 'Team',
        fieldIndex: 2
    }
];

const mockReferences = (result: Promise<GetReferencesResult>) => {
    const getReferencesToRecord = vi.fn(() => result);
    window.franchiseAPI = {
        getReferencesToRecord
    } as unknown as Window['franchiseAPI'];
    return getReferencesToRecord;
};

const setup = () => {
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const view = render(
        <ReferencesModal
            fileId='file-1'
            onClose={onClose}
            onOpen={onOpen}
            recordIndex={5}
            table={{ tableId: 4097, name: 'Team' }}
        />
    );
    return { onOpen, onClose, view, user: userEvent.setup() };
};

const rows = () =>
    screen
        .getAllByRole('button')
        .filter((button) => button.hasAttribute('data-table-id'));

describe('ReferencesModal', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows a loading state, then one row per referencing record', async () => {
        const get = mockReferences(Promise.resolve({ data: REFERENCES }));
        setup();
        expect(get).toHaveBeenCalledWith('file-1', 4097, 5);
        expect(screen.getByText('Finding references...')).toBeInTheDocument();
        expect(
            screen.getByRole('dialog', { name: 'References' })
        ).toHaveTextContent(
            'The following tables reference (4097) Team - Record #5:'
        );

        await screen.findAllByText('(4220) Player');
        expect(rows().map((row) => row.textContent)).toEqual([
            '(4220) PlayerRecord #3 · Team',
            '(4220) PlayerRecord #8 · Team'
        ]);
        expect(rows()[1]).toHaveAttribute('data-record-index', '8');
        expect(rows()[1]).toHaveAttribute('data-field-name', 'Team');
        expect(screen.queryByText('Finding references...')).toBeNull();
    });

    it('says when there are no references', async () => {
        mockReferences(Promise.resolve({ data: [] }));
        setup();
        expect(await screen.findByText('No references.')).toBeInTheDocument();
    });

    it('shows the error', async () => {
        mockReferences(Promise.resolve({ error: 'File not found: x' }));
        setup();
        expect(
            await screen.findByText(
                'Failed to load references: File not found: x'
            )
        ).toBeInTheDocument();
    });

    it('opens a row in this tab, a new tab, or a background tab', async () => {
        mockReferences(Promise.resolve({ data: REFERENCES }));
        const { onOpen, user } = setup();
        await screen.findAllByText('(4220) Player');

        await user.click(rows()[0]);
        expect(onOpen).toHaveBeenLastCalledWith(REFERENCES[0], 'current');

        await user.keyboard('{Control>}');
        await user.click(rows()[1]);
        await user.keyboard('{/Control}');
        expect(onOpen).toHaveBeenLastCalledWith(REFERENCES[1], 'newTab');

        fireEvent(
            rows()[0],
            new MouseEvent('auxclick', { bubbles: true, button: 1 })
        );
        expect(onOpen).toHaveBeenLastCalledWith(REFERENCES[0], 'background');
        expect(onOpen).toHaveBeenCalledTimes(3);
    });

    it('closes on Esc and X', async () => {
        mockReferences(Promise.resolve({ data: [] }));
        const { onClose, user } = setup();
        await user.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(2);
    });

    it('ignores a result that arrives after unmount', async () => {
        let resolve!: (result: GetReferencesResult) => void;
        mockReferences(new Promise((r) => (resolve = r)));
        const error = vi.spyOn(console, 'error');
        const { view } = setup();
        view.unmount();
        await act(async () => resolve({ data: REFERENCES }));
        expect(error).not.toHaveBeenCalled();
        expect(screen.queryByText('(4220) Player')).toBeNull();
    });
});
