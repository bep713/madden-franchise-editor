import { describe, expect, it } from 'vitest';
import type { SchemaField } from '@shared/types';
import {
    EMPTY_FILTERS,
    exactFilter,
    filterFields,
    hasFilters,
    nextSort,
    parseFilter,
    referencedTable,
    sortFields
} from './schemaViewer';

const f = (name: string, table: string, type: string): SchemaField => ({
    name,
    table,
    type
});

const fields = [
    f('Name', 'User', 's32'),
    f('Id', 'UserRegistry', 'User[]'),
    f('Other', 'Team', ''),
    f('name2', 'Team', 'User')
];

describe('parseFilter', () => {
    it('handles plain, padded and mixed case text', () => {
        expect(parseFilter('abc')).toEqual({ exact: false, value: 'abc' });
        expect(parseFilter('  abc ')).toEqual({ exact: false, value: 'abc' });
        expect(parseFilter('MiXed')).toEqual({ exact: false, value: 'mixed' });
    });
    it('parses exact filters without trimming the inside', () => {
        expect(parseFilter('"Exact"')).toEqual({
            exact: true,
            value: 'exact'
        });
        expect(parseFilter('" spaced "')).toEqual({
            exact: true,
            value: ' spaced '
        });
    });
    it('treats a lone quote or empty quotes as empty', () => {
        expect(parseFilter('"')).toEqual({ exact: false, value: '' });
        expect(parseFilter('""')).toEqual({ exact: false, value: '' });
    });
});

describe('filterFields', () => {
    it('filters each column alone, case-insensitively', () => {
        expect(
            filterFields(fields, { ...EMPTY_FILTERS, field: 'NAME' })
        ).toEqual([fields[0], fields[3]]);
        expect(
            filterFields(fields, { ...EMPTY_FILTERS, table: 'team' })
        ).toEqual([fields[2], fields[3]]);
        expect(filterFields(fields, { ...EMPTY_FILTERS, type: 's32' })).toEqual(
            [fields[0]]
        );
    });
    it('ANDs across columns', () => {
        expect(
            filterFields(fields, { field: 'name', table: 'team', type: '' })
        ).toEqual([fields[3]]);
    });
    it('distinguishes exact from substring', () => {
        expect(
            filterFields(fields, { ...EMPTY_FILTERS, table: 'User' })
        ).toEqual([fields[0], fields[1]]);
        expect(
            filterFields(fields, { ...EMPTY_FILTERS, table: '"User"' })
        ).toEqual([fields[0]]);
    });
    it('excludes empty type rows when a Type filter is set', () => {
        expect(
            filterFields(fields, { ...EMPTY_FILTERS, type: 'u' })
        ).not.toContain(fields[2]);
    });
    it('returns the same array when all filters are empty', () => {
        expect(filterFields(fields, EMPTY_FILTERS)).toBe(fields);
        expect(filterFields(fields, { field: ' ', table: '"', type: '' })).toBe(
            fields
        );
    });
});

describe('sortFields', () => {
    it('sorts each column asc and desc', () => {
        expect(
            sortFields(fields, { column: 'name', dir: 'asc' }).map(
                (x) => x.name
            )
        ).toEqual(['Id', 'Name', 'name2', 'Other']);
        expect(
            sortFields(fields, { column: 'table', dir: 'asc' }).map(
                (x) => x.table
            )
        ).toEqual(['Team', 'Team', 'User', 'UserRegistry']);
        expect(
            sortFields(fields, { column: 'type', dir: 'desc' }).map(
                (x) => x.type
            )
        ).toEqual(['User[]', 'User', 's32', '']);
    });
    it('keeps input order for ties in both directions', () => {
        expect(
            sortFields(fields, { column: 'table', dir: 'asc' }).slice(0, 2)
        ).toEqual([fields[2], fields[3]]);
        expect(
            sortFields(fields, { column: 'table', dir: 'desc' }).slice(2)
        ).toEqual([fields[2], fields[3]]);
    });
    it('returns the input for null and does not mutate', () => {
        expect(sortFields(fields, null)).toBe(fields);
        const copy = [...fields];
        sortFields(fields, { column: 'name', dir: 'desc' });
        expect(fields).toEqual(copy);
    });
});

describe('nextSort', () => {
    it('cycles asc, desc, null and resets on a column change', () => {
        const a = nextSort(null, 'name');
        expect(a).toEqual({ column: 'name', dir: 'asc' });
        const d = nextSort(a, 'name');
        expect(d).toEqual({ column: 'name', dir: 'desc' });
        expect(nextSort(d, 'name')).toBeNull();
        expect(nextSort(d, 'table')).toEqual({ column: 'table', dir: 'asc' });
    });
});

describe('referencedTable', () => {
    const names = new Set(['User']);
    it('resolves references', () => {
        expect(referencedTable('User[]', names)).toBe('User');
        expect(referencedTable('User', names)).toBe('User');
        expect(referencedTable('s32', names)).toBeNull();
        expect(referencedTable('Nope[]', names)).toBeNull();
    });
});

describe('helpers', () => {
    it('exactFilter and hasFilters', () => {
        expect(exactFilter('User')).toBe('"User"');
        expect(hasFilters(EMPTY_FILTERS)).toBe(false);
        expect(hasFilters({ ...EMPTY_FILTERS, type: 'x' })).toBe(true);
    });
});
