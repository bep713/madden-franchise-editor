import { describe, expect, it } from 'vitest';
import type { TableColumn, TableData } from '@shared/types';
import { buildColumns } from './columns';
import { getCellMeta, type CellMetaContext } from './cellMeta';
import { createOrientation } from './orientation';
import { errorRenderer } from './renderers/errorRenderer';

const referenceRenderer = (() => {}) as never;
const blobRenderer = (() => {}) as never;

const col = (overrides: Partial<TableColumn>): TableColumn => ({
    name: 'Name',
    type: 'int',
    offset: 0,
    isReference: false,
    valueInThirdTable: false,
    maxLength: null,
    length: 4,
    enum: null,
    ...overrides
});

const headers = [
    col({ name: 'Text', type: 'string' }),
    col({ name: 'Flag', type: 'bool' })
];

function makeContext(inverted: boolean): CellMetaContext {
    const table = {
        tableId: 1,
        headers,
        records: [
            { Text: 'a', Flag: 'true' },
            { Text: 'b', Flag: 'false' }
        ]
    } as unknown as TableData;
    return {
        table,
        orientation: createOrientation(
            inverted,
            headers.map((h) => h.name),
            { toPhysicalRow: (r) => r, toVisualRow: (r) => r }
        ),
        fieldColumns: buildColumns(headers, {
            reference: referenceRenderer,
            blob: blobRenderer
        }),
        writeState: {
            cellErrors: { 0: { Text: 'bad' } },
            emptyRecordIndices: new Set([1])
        },
        tableNames: new Map()
    };
}

describe('getCellMeta (inverted)', () => {
    const context = makeContext(true);

    it('makes the field-name column a read-only header', () => {
        expect(getCellMeta(1, 0, context)).toMatchObject({
            readOnly: true,
            editor: false,
            className: 'table-cell--field-name'
        });
    });

    it("gives each row its field's editor, renderer and source", () => {
        // row 1 = Flag, column 2 = record 1
        expect(getCellMeta(1, 2, context)).toMatchObject({
            editor: 'dropdown',
            renderer: 'dropdown',
            source: ['true', 'false'],
            wordWrap: false
        });
        const text = getCellMeta(0, 2, context);
        expect(text).toMatchObject({ editor: 'text', renderer: 'text' });
        // Returned, so an earlier dropdown cell's source doesn't stick
        expect(text).toHaveProperty('source', undefined);
    });

    it('marks empty and error cells by record', () => {
        expect(getCellMeta(1, 2, context).className).toBe('table-cell--empty');
        expect(getCellMeta(1, 1, context).className).toBe('');
        expect(getCellMeta(0, 1, context)).toMatchObject({
            className: 'table-cell--error',
            readOnly: true,
            renderer: errorRenderer,
            errorMessage: 'bad'
        });
    });
});

describe('getCellMeta (normal)', () => {
    const context = makeContext(false);

    it('leaves editors and sources to the column settings', () => {
        const meta = getCellMeta(1, 1, context);
        expect(meta).toMatchObject({
            editor: 'dropdown',
            className: 'table-cell--empty',
            readOnly: false
        });
        expect(meta).not.toHaveProperty('source');
    });

    it('marks error cells by record and field', () => {
        expect(getCellMeta(0, 0, context).errorMessage).toBe('bad');
        expect(getCellMeta(0, 1, context).errorMessage).toBeUndefined();
    });
});
