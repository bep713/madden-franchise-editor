import type { SchemaField } from '@shared/types';

export type SchemaColumn = 'name' | 'table' | 'type';

export interface FieldFilters {
    field: string;
    table: string;
    type: string;
}

export const EMPTY_FILTERS: FieldFilters = { field: '', table: '', type: '' };

export type FieldSort = { column: SchemaColumn; dir: 'asc' | 'desc' } | null;

// Text wrapped in "quotes" matches exactly; anything else is a substring
export function parseFilter(text: string): { exact: boolean; value: string } {
    const trimmed = text.trim();
    if (trimmed === '"' || trimmed === '""') {
        return { exact: false, value: '' };
    }
    if (
        trimmed.length >= 2 &&
        trimmed.startsWith('"') &&
        trimmed.endsWith('"')
    ) {
        return { exact: true, value: trimmed.slice(1, -1).toLowerCase() };
    }
    return { exact: false, value: trimmed.toLowerCase() };
}

export function hasFilters(filters: FieldFilters): boolean {
    return Boolean(filters.field || filters.table || filters.type);
}

export function exactFilter(name: string): string {
    return `"${name}"`;
}

export function filterFields(
    fields: SchemaField[],
    filters: FieldFilters
): SchemaField[] {
    const checks = (
        [
            ['name', filters.field],
            ['table', filters.table],
            ['type', filters.type]
        ] as const
    )
        .map(([column, text]) => ({ column, ...parseFilter(text) }))
        .filter((c) => c.value !== '');
    if (checks.length === 0) return fields;
    return fields.filter((f) =>
        checks.every(({ column, exact, value }) => {
            const cell = f[column].toLowerCase();
            return exact ? cell === value : cell.includes(value);
        })
    );
}

// Shared, because localeCompare with options builds a collator per call
// (~50x slower over a 30k-field schema)
const collator = new Intl.Collator(undefined, { sensitivity: 'base' });

export function sortFields(
    fields: SchemaField[],
    sort: FieldSort
): SchemaField[] {
    if (!sort) return fields;
    const { column } = sort;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return fields
        .map((f, i) => ({ f, i }))
        .sort(
            (a, b) =>
                sign * collator.compare(a.f[column], b.f[column]) || a.i - b.i
        )
        .map(({ f }) => f);
}

export function nextSort(current: FieldSort, column: SchemaColumn): FieldSort {
    if (!current || current.column !== column) return { column, dir: 'asc' };
    return current.dir === 'asc' ? { column, dir: 'desc' } : null;
}

// A reference type is a table name, optionally with [] on the end
export function referencedTable(
    type: string,
    tableNames: ReadonlySet<string>
): string | null {
    const name = type.endsWith('[]') ? type.slice(0, -2) : type;
    return tableNames.has(name) ? name : null;
}
