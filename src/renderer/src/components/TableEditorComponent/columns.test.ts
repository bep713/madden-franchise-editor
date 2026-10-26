import { describe, expect, it } from 'vitest';
import type { TableColumn } from '@shared/types/franchise';
import { buildColumns, calculateColumnWidths } from './columns';

const renderers = {
    reference: (() => {}) as never,
    blob: (() => {}) as never
};

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

describe('buildColumns', () => {
    it('uses a dropdown with the enum member names', () => {
        const [c] = buildColumns(
            [
                col({
                    name: 'Pos',
                    enum: {
                        name: 'Position',
                        members: [
                            { name: 'QB', value: 0 },
                            { name: 'RB', value: 1 }
                        ]
                    }
                })
            ],
            renderers
        );
        expect(c).toMatchObject({
            data: 'Pos',
            editor: 'dropdown',
            renderer: 'dropdown',
            source: ['QB', 'RB'],
            wordWrap: false
        });
        expect(c).not.toHaveProperty('type');
    });

    it('uses true/false for bools', () => {
        const [c] = buildColumns([col({ type: 'bool' })], renderers);
        expect(c).toMatchObject({
            editor: 'dropdown',
            renderer: 'dropdown',
            source: ['true', 'false']
        });
    });

    it('uses the reference renderer with a text editor', () => {
        const [c] = buildColumns([col({ isReference: true })], renderers);
        expect(c.renderer).toBe(renderers.reference);
        expect(c.editor).toBe('text');
    });

    it('uses the blob renderer without an editor', () => {
        const [c] = buildColumns([col({ valueInThirdTable: true })], renderers);
        expect(c.renderer).toBe(renderers.blob);
        expect(c.editor).toBe(false);
    });

    it('uses text otherwise', () => {
        const [c] = buildColumns([col({})], renderers);
        expect(c).toMatchObject({ renderer: 'text', editor: 'text' });
        expect(c).not.toHaveProperty('source');
    });
});

describe('calculateColumnWidths', () => {
    it('matches v4 for each branch', () => {
        const widths = calculateColumnWidths([
            col({ isReference: true, type: 'Stadium' }), // (7+6)*9+35 = 152 -> 350
            col({ isReference: true, type: 'T'.repeat(40) }), // (46)*9+35 = 449
            col({
                enum: { name: 'E', members: [] },
                type: 'Enum'
            }), // 350
            col({ valueInThirdTable: true }), // 700
            col({ maxLength: 10 }), // 116
            col({ type: 'bool' }), // 80
            col({ length: 32 }), // 314
            col({ length: 4 }) // 62
        ]);
        expect(widths).toEqual([350, 449, 350, 700, 116, 80, 314, 62]);
    });

    it('never goes below the header-name minimum', () => {
        const name = 'A'.repeat(50); // 50*9+26 = 476
        expect(
            calculateColumnWidths([col({ name, type: 'bool' }), col({ name })])
        ).toEqual([476, 476]);
    });
});
