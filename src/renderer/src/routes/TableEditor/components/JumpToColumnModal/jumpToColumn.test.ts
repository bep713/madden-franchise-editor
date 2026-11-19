import { describe, it, expect } from 'vitest';
import { filterColumns, parseRowIndex } from './jumpToColumn';

const NAMES = ['FirstName', 'LongName', 'ShortName', 'Overall'];

describe('filterColumns', () => {
    it('returns every column for empty text', () => {
        expect(filterColumns(NAMES, '  ')).toEqual([
            { index: 0, name: 'FirstName' },
            { index: 1, name: 'LongName' },
            { index: 2, name: 'ShortName' },
            { index: 3, name: 'Overall' }
        ]);
    });

    it('matches a case-insensitive substring in header order', () => {
        expect(filterColumns(NAMES, 'NAME')).toEqual([
            { index: 0, name: 'FirstName' },
            { index: 1, name: 'LongName' },
            { index: 2, name: 'ShortName' }
        ]);
        expect(filterColumns(NAMES, ' gn ')).toEqual([
            { index: 1, name: 'LongName' }
        ]);
    });

    it('returns nothing when no column matches', () => {
        expect(filterColumns(NAMES, 'xyz')).toEqual([]);
    });
});

describe('parseRowIndex', () => {
    it('parses a number', () => {
        expect(parseRowIndex('52', 100)).toBe(52);
    });

    it('parses a leading number like parseInt', () => {
        expect(parseRowIndex('12abc', 100)).toBe(12);
    });

    it('turns empty, NaN and negative input into 0', () => {
        expect(parseRowIndex('', 100)).toBe(0);
        expect(parseRowIndex('abc', 100)).toBe(0);
        expect(parseRowIndex('-3', 100)).toBe(0);
    });

    it('clamps to the last row', () => {
        expect(parseRowIndex('250', 100)).toBe(99);
    });

    it('returns 0 for a table with no rows', () => {
        expect(parseRowIndex('5', 0)).toBe(0);
    });
});
