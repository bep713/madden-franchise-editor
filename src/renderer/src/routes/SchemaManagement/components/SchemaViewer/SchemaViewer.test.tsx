import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    SchemaField,
    SchemaFieldsResult,
    SchemaFieldsSource
} from '@shared/types';
import { EMPTY_FILTERS, type FieldFilters } from '../../schemaViewer';
import SchemaViewer from './SchemaViewer';

// AutoSizer measures 0x0 in jsdom, which renders no rows
vi.mock('react-virtualized-auto-sizer', () => ({
    default: ({
        children
    }: {
        children: (size: { height: number; width: number }) => unknown;
    }) => children({ height: 600, width: 400 })
}));

const FIELDS: SchemaField[] = [
    { name: 'FirstName', table: 'Player', type: 'string' },
    { name: 'Team', table: 'Player', type: 'Team' },
    { name: 'Name', table: 'Team', type: 'string' },
    { name: 'Roster', table: 'Team', type: 'Player[]' }
];

const ok = (fields: SchemaField[]): SchemaFieldsResult => ({
    meta: null,
    fields
});

const getFields = vi.fn();

beforeEach(() => {
    getFields.mockReset();
    getFields.mockResolvedValue(ok(FIELDS));
    Object.assign(window, { electronAPI: { schema: { getFields } } });
});

interface RenderOptions {
    source?: SchemaFieldsSource;
    filters?: FieldFilters;
}

function renderViewer({
    source = { path: 'a.gz' },
    filters = EMPTY_FILTERS
}: RenderOptions = {}) {
    const onFiltersChange = vi.fn();
    const onClose = vi.fn();
    const props = { label: 'M25', onClose, onFiltersChange };
    const utils = render(
        <SchemaViewer {...props} filters={filters} source={source} />
    );
    return {
        ...utils,
        onClose,
        onFiltersChange,
        rerender: (next: RenderOptions) =>
            utils.rerender(
                <SchemaViewer
                    {...props}
                    filters={next.filters ?? filters}
                    source={next.source ?? source}
                />
            )
    };
}

// The page holds the filters; this stands in for it
function Controlled() {
    const [filters, setFilters] = useState(EMPTY_FILTERS);
    return (
        <SchemaViewer
            filters={filters}
            label='M25'
            onClose={() => {}}
            onFiltersChange={setFilters}
            source={{ path: 'a.gz' }}
        />
    );
}

const rowFields = () =>
    Array.from(document.querySelectorAll('[role="row"][data-field]')).map((r) =>
        r.getAttribute('data-field')
    );

const header = (column: string) =>
    document.querySelector(`[data-sort-column="${column}"]`) as HTMLElement;

const loaded = () => screen.findByTestId('field-count');

describe('SchemaViewer', () => {
    it('shows the header and closes with the X', async () => {
        const { onClose } = renderViewer();
        await loaded();
        expect(
            screen.getByRole('heading', { name: 'M25 Schema Viewer' })
        ).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: 'Close schema viewer' })
        );
        expect(onClose).toHaveBeenCalled();
    });

    it('counts every field without filters', async () => {
        renderViewer();
        expect((await loaded()).textContent).toBe('4 fields');
        expect(rowFields()).toEqual(['FirstName', 'Team', 'Name', 'Roster']);
    });

    it('counts the matches when filtering', async () => {
        renderViewer({ filters: { ...EMPTY_FILTERS, table: 'team' } });
        await waitFor(async () =>
            expect((await loaded()).textContent).toBe('2 of 4 fields')
        );
        expect(rowFields()).toEqual(['Name', 'Roster']);
    });

    it('sends a changed filter key', async () => {
        const { onFiltersChange } = renderViewer({
            filters: { ...EMPTY_FILTERS, table: 'P' }
        });
        await loaded();
        await userEvent.type(screen.getByLabelText('Field'), 'x');
        expect(onFiltersChange).toHaveBeenLastCalledWith({
            field: 'x',
            table: 'P',
            type: ''
        });
    });

    it('filters as you type', async () => {
        render(<Controlled />);
        await loaded();
        await userEvent.type(screen.getByLabelText('Type'), 'string');
        await waitFor(() => expect(rowFields()).toEqual(['FirstName', 'Name']));
    });

    it('disables Clear filters when nothing is set', async () => {
        const { onFiltersChange } = renderViewer();
        await loaded();
        const clear = document.querySelector(
            '[data-action="clear-filters"]'
        ) as HTMLElement;
        expect(clear.getAttribute('aria-disabled')).toBe('true');
        await userEvent.click(clear);
        expect(onFiltersChange).not.toHaveBeenCalled();
    });

    it('clears every filter', async () => {
        const { onFiltersChange } = renderViewer({
            filters: { field: 'a', table: 'b', type: 'c' }
        });
        await loaded();
        const clear = document.querySelector(
            '[data-action="clear-filters"]'
        ) as HTMLElement;
        expect(clear.getAttribute('aria-disabled')).toBeNull();
        await userEvent.click(clear);
        expect(onFiltersChange).toHaveBeenCalledWith(EMPTY_FILTERS);
    });

    it('filters by a clicked table', async () => {
        const { onFiltersChange } = renderViewer({
            filters: { field: 'name', table: '', type: 'string' }
        });
        await waitFor(() => expect(rowFields()).toEqual(['FirstName', 'Name']));
        await userEvent.click(
            document.querySelector(
                '[data-field="Name"] [data-action="filter-table"]'
            ) as HTMLElement
        );
        expect(onFiltersChange).toHaveBeenCalledWith({
            field: '',
            type: '',
            table: '"Team"'
        });
    });

    it('jumps to a referenced table and leaves primitives as text', async () => {
        const { onFiltersChange } = renderViewer();
        await loaded();
        const row = (name: string) =>
            document.querySelector(`[data-field="${name}"]`) as HTMLElement;
        expect(
            row('FirstName').querySelector('[data-action="jump-type"]')
        ).toBeNull();
        await userEvent.click(
            row('Roster').querySelector(
                '[data-action="jump-type"]'
            ) as HTMLElement
        );
        expect(onFiltersChange).toHaveBeenCalledWith({
            field: '',
            type: '',
            table: '"Player"'
        });
    });

    it('cycles a column sort asc, desc, none', async () => {
        renderViewer();
        await loaded();
        const cell = () => header('name').closest('[role="columnheader"]')!;
        expect(cell().getAttribute('aria-sort')).toBe('none');

        await userEvent.click(header('name'));
        expect(cell().getAttribute('aria-sort')).toBe('ascending');
        expect(rowFields()).toEqual(['FirstName', 'Name', 'Roster', 'Team']);

        await userEvent.click(header('name'));
        expect(cell().getAttribute('aria-sort')).toBe('descending');
        expect(rowFields()).toEqual(['Team', 'Roster', 'Name', 'FirstName']);

        await userEvent.click(header('name'));
        expect(cell().getAttribute('aria-sort')).toBe('none');
        expect(rowFields()).toEqual(['FirstName', 'Team', 'Name', 'Roster']);
    });

    it('resets the sort when the source changes', async () => {
        const { rerender } = renderViewer();
        await loaded();
        await userEvent.click(header('name'));
        expect(rowFields()[0]).toBe('FirstName');
        expect(rowFields()[3]).toBe('Team');

        rerender({ source: { path: 'b.gz' } });
        await waitFor(() => expect(getFields).toHaveBeenCalledTimes(2));
        await waitFor(() =>
            expect(
                header('name')
                    .closest('[role="columnheader"]')!
                    .getAttribute('aria-sort')
            ).toBe('none')
        );
        expect(rowFields()).toEqual(['FirstName', 'Team', 'Name', 'Roster']);
    });

    it('shows an empty state when nothing matches', async () => {
        renderViewer({ filters: { ...EMPTY_FILTERS, field: 'zzz' } });
        expect(
            await screen.findByText('No fields match these filters')
        ).toBeTruthy();
        expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    });

    it('shows a loader on the first load', async () => {
        let resolve!: (r: SchemaFieldsResult) => void;
        getFields.mockReturnValue(new Promise((r) => (resolve = r)));
        renderViewer();
        expect(screen.getByRole('status')).toBeTruthy();
        expect(screen.queryByTestId('field-count')).toBeNull();
        expect(screen.queryByRole('table')).toBeNull();
        await act(async () => resolve(ok(FIELDS)));
        expect(screen.queryByRole('status')).toBeNull();
        expect(screen.getByRole('table')).toBeTruthy();
    });

    it('shows an error and retries', async () => {
        getFields.mockResolvedValueOnce({ error: 'bad gzip' });
        renderViewer();
        expect(
            await screen.findByText('Could not read this schema.')
        ).toBeTruthy();
        expect(screen.getByText('bad gzip')).toBeTruthy();
        await userEvent.click(
            document.querySelector('[data-action="retry"]') as HTMLElement
        );
        expect((await loaded()).textContent).toBe('4 fields');
        expect(getFields).toHaveBeenCalledTimes(2);
    });
});
