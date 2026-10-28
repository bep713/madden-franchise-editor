import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableListItem } from '@shared/types';
import TableSidebar from './TableSidebar';
import { buildSidebarRows } from './sidebarRows';

// AutoSizer measures 0x0 in jsdom, which renders no rows
vi.mock('react-virtualized-auto-sizer', () => ({
    default: ({
        children
    }: {
        children: (size: { height: number; width: number }) => unknown;
    }) => children({ height: 600, width: 300 })
}));

const table = (id: number, name: string): TableListItem => ({
    id,
    uniqueId: id * 10,
    name,
    recordCount: 1,
    isArray: false
});

const A = table(4096, 'A');
const PLAYER = table(4220, 'Player');
const rows = (showPinnedTables: boolean) =>
    buildSidebarRows(
        [A, PLAYER],
        [PLAYER],
        (t) => t.id === PLAYER.id,
        showPinnedTables
    );

const setup = (showPinnedTables = true) => {
    const onTableSelect = vi.fn();
    const onTogglePin = vi.fn();
    const onTogglePinnedVisible = vi.fn();
    const { container } = render(
        <TableSidebar
            onTableSelect={onTableSelect}
            onTogglePinnedVisible={onTogglePinnedVisible}
            onTogglePin={onTogglePin}
            rows={rows(showPinnedTables)}
            selectedTableId={-1}
            showPinnedTables={showPinnedTables}
        />
    );
    const section = (name: string) =>
        container.querySelector(
            `[data-section="${name}"]:has([data-table-id="${PLAYER.id}"])`
        ) as HTMLElement;
    return {
        onTableSelect,
        onTogglePin,
        onTogglePinnedVisible,
        section,
        user: userEvent.setup()
    };
};

describe('TableSidebar', () => {
    it('renders a pinned table only in the Pinned section, with the pin icon', () => {
        const { section } = setup();
        expect(screen.getByText('Pinned')).toBeInTheDocument();
        expect(
            within(section('pinned')).getByRole('img', { name: 'Pinned' })
        ).toBeInTheDocument();
        expect(section('all')).toBeNull();
        // The unpinned table has no icon, and a pin button instead of unpin
        const a = screen.getByText('A').closest('button') as HTMLElement;
        expect(within(a).queryByRole('img', { name: 'Pinned' })).toBeNull();
        expect(screen.getAllByRole('button', { name: /^Unpin/ })).toHaveLength(
            1
        );
        expect(
            screen.getByRole('button', { name: 'Pin A' })
        ).toBeInTheDocument();
    });

    // With the Pinned section hidden, pinned tables stay in the full list
    it.each([
        ['pinned', true],
        ['all', false]
    ])(
        'unpins from the %s section without selecting the table',
        async (name, showPinnedTables) => {
            const { onTableSelect, onTogglePin, section, user } =
                setup(showPinnedTables);
            await user.click(
                within(section(name)).getByRole('button', {
                    name: 'Unpin Player'
                })
            );
            expect(onTogglePin).toHaveBeenCalledWith(PLAYER);
            expect(onTableSelect).not.toHaveBeenCalled();
        }
    );

    it('pins an unpinned table without selecting it', async () => {
        const { onTableSelect, onTogglePin, user } = setup();
        await user.click(screen.getByRole('button', { name: 'Pin A' }));
        expect(onTogglePin).toHaveBeenCalledWith(A);
        expect(onTableSelect).not.toHaveBeenCalled();
    });

    it('selects a table when its card is clicked', async () => {
        const { onTableSelect, section, user } = setup();
        await user.click(
            section('pinned').querySelector('[data-table-id]') as HTMLElement
        );
        expect(onTableSelect).toHaveBeenCalledWith(PLAYER, 'current');
    });

    it('opens a ctrl-clicked table in a new tab', async () => {
        const { onTableSelect, user } = setup();
        const card = screen.getByText('A').closest('button') as HTMLElement;
        await user.keyboard('{Control>}');
        await user.click(card);
        await user.keyboard('{/Control}');
        expect(onTableSelect).toHaveBeenCalledWith(A, 'newTab');
    });

    it('opens a middle-clicked table in a background tab', () => {
        const { onTableSelect } = setup();
        const card = screen.getByText('A').closest('button') as HTMLElement;
        // No autoscroll
        expect(fireEvent.mouseDown(card, { button: 1 })).toBe(false);
        fireEvent(
            card,
            new MouseEvent('auxclick', { bubbles: true, button: 1 })
        );
        expect(onTableSelect).toHaveBeenCalledTimes(1);
        expect(onTableSelect).toHaveBeenCalledWith(A, 'background');
    });

    it.each([
        [true, 'Hide pinned tables'],
        [false, 'Show pinned tables']
    ])('toggle button reflects showPinnedTables=%s', async (shown, title) => {
        const { onTogglePinnedVisible, user } = setup(shown);
        const toggle = screen.getByTitle(title);
        expect(toggle).toHaveAttribute('aria-pressed', String(shown));
        await user.click(toggle);
        expect(onTogglePinnedVisible).toHaveBeenCalledTimes(1);
    });
});
