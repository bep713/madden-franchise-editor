import { describe, expect, it } from 'vitest';
import { createOrientation, toSelectionCell } from './orientation';

const headerNames = ['A', 'B', 'C'];
// Visual row r is physical row r + 10
const rows = {
    toPhysicalRow: (row: number) => row + 10,
    toVisualRow: (row: number) => row - 10
};

describe('createOrientation (normal)', () => {
    const orientation = createOrientation(false, headerNames, rows);

    it('maps a visual cell to its record and field, by name or index', () => {
        expect(orientation.toRecordCell(2, 'B')).toEqual({
            recordIndex: 12,
            fieldIndex: 1
        });
        expect(orientation.toRecordCell(2, 2)).toEqual({
            recordIndex: 12,
            fieldIndex: 2
        });
        expect(orientation.toRecordCell(2, 'Missing')).toBeNull();
    });

    it('round trips through toVisualCell', () => {
        const cell = orientation.toRecordCell(4, 'C')!;
        expect(orientation.toVisualCell(cell)).toEqual([4, 2]);
    });

    it('gives the physical row and field name for source edits', () => {
        expect(
            orientation.toSourceCell({ recordIndex: 12, fieldIndex: 1 })
        ).toEqual([12, 'B']);
    });

    it('maps physical cells without the row mapper', () => {
        expect(orientation.physicalToRecordCell(5, 1)).toEqual({
            recordIndex: 5,
            fieldIndex: 1
        });
        expect(orientation.physicalToRecordCell(5, 3)).toBeNull();
    });

    it('looks up field indices', () => {
        expect(orientation.fieldIndexOf('C')).toBe(2);
        expect(orientation.fieldIndexOf('Z')).toBeUndefined();
    });
});

describe('createOrientation (inverted)', () => {
    const orientation = createOrientation(true, headerNames, rows);

    it('maps row to field and column to record + 1', () => {
        expect(orientation.toRecordCell(1, 4)).toEqual({
            recordIndex: 3,
            fieldIndex: 1
        });
        expect(orientation.physicalToRecordCell(1, 4)).toEqual({
            recordIndex: 3,
            fieldIndex: 1
        });
    });

    it('has no record cell for the field-name column', () => {
        expect(orientation.toRecordCell(1, 0)).toBeNull();
        expect(orientation.physicalToRecordCell(1, 0)).toBeNull();
    });

    it('round trips, with the same visual and source cell', () => {
        const cell = { recordIndex: 3, fieldIndex: 2 };
        expect(orientation.toVisualCell(cell)).toEqual([2, 4]);
        expect(orientation.toSourceCell(cell)).toEqual([2, 4]);
        expect(orientation.toRecordCell(2, 4)).toEqual(cell);
    });
});

describe('toSelectionCell', () => {
    it('reports a field-name cell as the first record of the field', () => {
        const inverted = createOrientation(true, headerNames, rows);
        expect(toSelectionCell(inverted, 2, 0)).toEqual({
            recordIndex: 0,
            fieldIndex: 2
        });
        expect(toSelectionCell(inverted, 2, 3)).toEqual({
            recordIndex: 2,
            fieldIndex: 2
        });
    });
});
