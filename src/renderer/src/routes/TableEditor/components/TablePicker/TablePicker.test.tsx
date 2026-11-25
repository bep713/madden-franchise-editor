import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TableListItem } from '@shared/types';
import TablePicker from './TablePicker';
import { buildSidebarRows } from '../TableSidebar/sidebarRows';
import { filterTables } from '../../filterTables';

const table = (id: number, name: string, index: number) => ({
    id,
    index,
    uniqueId: id * 10,
    name,
    recordCount: 1,
    isArray: false
});

const A = table(4096, '\u0000', 0);
const TEAM = table(4150, 'Team', 1);
const PLAYER = table(4220, 'Player', 2);
const COACH = table(4300, 'Coach', 3);
const TABLES = [A, TEAM, PLAYER, COACH];

// The table editor's wiring: the picker's filter text picks the rows
function Harness({
    onTableSelect,
    onFilter,
    pinned = [] as TableListItem[],
    selected
}: {
    onTableSelect: (table: TableListItem, mode: string) => void;
    onFilter?: (text: string) => void;
    pinned?: TableListItem[];
    selected?: TableListItem;
}) {
    const [filter, setFilter] = useState('');
    const rows = buildSidebarRows(
        filterTables(TABLES, filter),
        pinned,
        (t) => pinned.some((p) => p.id === t.id),
        true
    );
    return (
        <TablePicker
            onFilter={(text) => {
                setFilter(text);
                onFilter?.(text);
            }}
            onTableSelect={onTableSelect}
            rows={rows}
            selectedTable={selected}
        />
    );
}

const setup = (props: Partial<Parameters<typeof Harness>[0]> = {}) => {
    const onTableSelect = vi.fn();
    const onFilter = vi.fn();
    render(
        <Harness
            onFilter={onFilter}
            onTableSelect={onTableSelect}
            selected={PLAYER}
            {...props}
        />
    );
    const input = screen.getByRole('combobox') as HTMLInputElement;
    const highlighted = () =>
        screen
            .queryAllByRole('option')
            .find((o) => o.getAttribute('aria-selected') === 'true')
            ?.getAttribute('data-table-id');
    const optionIds = () =>
        screen
            .queryAllByRole('option')
            .map((o) => o.getAttribute('data-table-id'));
    return {
        input,
        highlighted,
        optionIds,
        onTableSelect,
        onFilter,
        user: userEvent.setup()
    };
};

describe('TablePicker', () => {
    it('shows the selected table title at rest', () => {
        const { input } = setup();
        expect(input.value).toBe('4220 - Player');
        expect(input.getAttribute('aria-expanded')).toBe('false');
        expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('shows the placeholder with no selected table', () => {
        const { input } = setup({ selected: undefined });
        expect(input.value).toBe('');
        expect(input.placeholder).toBe('Search tables...');
    });

    it('opens on focus with the current table highlighted', async () => {
        const { input, highlighted, optionIds, user } = setup();
        await user.click(input);
        expect(input.getAttribute('aria-expanded')).toBe('true');
        expect(screen.getByRole('listbox')).toBeTruthy();
        expect(optionIds()).toEqual(['4096', '4150', '4220', '4300']);
        expect(highlighted()).toBe('4220');
        // The unnamed table shows only its id
        expect(screen.getAllByRole('option')[0].textContent).toBe('4096');
    });

    it('filters as you type and highlights the first match', async () => {
        const { input, highlighted, onFilter, user } = setup();
        await user.click(input);
        await user.keyboard('Coach');
        expect(onFilter).toHaveBeenLastCalledWith('Coach');
        expect(highlighted()).toBe('4300');
    });

    it('moves the highlight with the arrow keys, skipping non-table rows', async () => {
        const { input, highlighted, user } = setup({
            pinned: [COACH],
            selected: COACH
        });
        await user.click(input);
        // Pinned label, Coach (pinned), divider, then the rest
        expect(highlighted()).toBe('4300');
        await user.keyboard('{ArrowDown}');
        expect(highlighted()).toBe('4096');
        await user.keyboard('{ArrowUp}');
        expect(highlighted()).toBe('4300');
        // Nothing above the first table
        await user.keyboard('{ArrowUp}');
        expect(highlighted()).toBe('4300');
    });

    it('opens the highlighted table in the current tab on Enter', async () => {
        const { input, onFilter, onTableSelect, user } = setup();
        await user.click(input);
        await user.keyboard('Team{Enter}');
        expect(onTableSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: TEAM.id }),
            'current'
        );
        expect(onFilter).toHaveBeenLastCalledWith('');
        expect(input.getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).not.toBe(input);
    });

    it('opens a new tab on Ctrl+click and stays open', async () => {
        const { input, onTableSelect, user } = setup();
        await user.click(input);
        const option = screen
            .getAllByRole('option')
            .find((o) => o.getAttribute('data-table-id') === '4150')!;
        fireEvent.click(option, { ctrlKey: true });
        expect(onTableSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: TEAM.id }),
            'newTab'
        );
        expect(input.getAttribute('aria-expanded')).toBe('true');
    });

    it('opens a background tab on middle-click', async () => {
        const { input, onTableSelect, user } = setup();
        await user.click(input);
        const option = screen
            .getAllByRole('option')
            .find((o) => o.getAttribute('data-table-id') === '4150')!;
        // No autoscroll, and focus stays in the input
        expect(fireEvent.mouseDown(option, { button: 1 })).toBe(false);
        fireEvent(
            option,
            new MouseEvent('auxclick', { bubbles: true, button: 1 })
        );
        expect(onTableSelect).toHaveBeenCalledWith(
            expect.objectContaining({ id: TEAM.id }),
            'background'
        );
    });

    it('opens and closes from the dropdown arrow', () => {
        const { input } = setup();
        const toggle = screen.getByTestId('table-picker-toggle');
        fireEvent.mouseDown(toggle);
        expect(document.activeElement).toBe(input);
        expect(input.getAttribute('aria-expanded')).toBe('true');
        fireEvent.mouseDown(toggle);
        expect(document.activeElement).not.toBe(input);
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });

    it('restores the title and clears the filter on Escape', async () => {
        const { input, onFilter, user } = setup();
        await user.click(input);
        await user.keyboard('Coa{Escape}');
        expect(input.value).toBe('4220 - Player');
        expect(onFilter).toHaveBeenLastCalledWith('');
        expect(input.getAttribute('aria-expanded')).toBe('false');
    });

    it('lists pinned tables first, with the label and divider', async () => {
        const { input, optionIds, user } = setup({ pinned: [COACH, TEAM] });
        await user.click(input);
        expect(screen.getByText('Pinned')).toBeTruthy();
        expect(optionIds()).toEqual(['4300', '4150', '4096', '4220']);
        const pinnedOptions = screen
            .getAllByRole('option')
            .filter((o) => o.getAttribute('data-section') === 'pinned');
        expect(pinnedOptions).toHaveLength(2);
    });
});
