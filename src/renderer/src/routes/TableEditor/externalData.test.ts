import { describe, expect, it } from 'vitest';
import { TableData } from '@shared/types';
import { errorMessage, getExportData } from './externalData';

function makeTable(records: Record<string, unknown>[]): TableData {
    return {
        headers: [{ name: 'B' }, { name: 'A' }],
        records
    } as unknown as TableData;
}

describe('getExportData', () => {
    it('keeps the header order', () => {
        const { headers, rows } = getExportData(
            makeTable([{ A: 1, B: 2, C: 3 }])
        );
        expect(headers).toEqual(['B', 'A']);
        expect(rows).toEqual([[2, 1]]);
    });

    it('exports null and undefined as empty strings', () => {
        const { rows } = getExportData(makeTable([{ A: null }, {}]));
        expect(rows).toEqual([
            ['', ''],
            ['', '']
        ]);
    });

    it('includes values edited in place', () => {
        const table = makeTable([{ A: 'old', B: false }]);
        table.records[0].A = 'new';
        expect(getExportData(table).rows).toEqual([[false, 'new']]);
    });
});

describe('errorMessage', () => {
    it('uses the message, or the value', () => {
        expect(errorMessage(new Error('boom'))).toBe('boom');
        expect(errorMessage('plain')).toBe('plain');
    });
});
