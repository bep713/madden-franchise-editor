import { describe, expect, it } from 'vitest';
import {
    bin2dec,
    calculateReferenceBinary,
    dec2bin,
    formatReference,
    parseReference,
    resolveReference
} from './references';

const A = '00100000010110100000000000010010';
const B = '00100000011001000000000000011001';

describe('references', () => {
    it('converts binary and decimal', () => {
        expect(bin2dec('1010')).toBe(10);
        expect(dec2bin(5)).toBe('101');
        expect(dec2bin(5, 8)).toBe('00000101');
    });

    it('builds the v4 binaries', () => {
        expect(calculateReferenceBinary(4141, 18)).toBe(A);
        expect(calculateReferenceBinary(4146, 25)).toBe(B);
        expect(calculateReferenceBinary(0, 0)).toBe('0'.repeat(32));
    });

    it('parses the v4 binaries', () => {
        expect(parseReference(A)).toEqual({ tableId: 4141, recordIndex: 18 });
        expect(parseReference(B)).toEqual({ tableId: 4146, recordIndex: 25 });
    });

    it('rejects flag 1, wrong lengths and non-strings', () => {
        expect(parseReference('1' + A.slice(1))).toBeNull();
        expect(parseReference(A.slice(1))).toBeNull();
        expect(parseReference(A + '0')).toBeNull();
        expect(parseReference('')).toBeNull();
        expect(parseReference(123)).toBeNull();
        expect(parseReference(null)).toBeNull();
        expect(parseReference(undefined)).toBeNull();
    });

    it('resolves against known tables', () => {
        const names = new Map([[4141, 'StadiumPartInfo']]);
        expect(resolveReference(A, names)).toEqual({
            tableId: 4141,
            recordIndex: 18,
            tableName: 'StadiumPartInfo'
        });
    });

    it('does not resolve a missing table or table 0', () => {
        expect(resolveReference(B, new Map([[4141, 'x']]))).toBeNull();
        expect(
            resolveReference('0'.repeat(32), new Map([[0, 'zero']]))
        ).toBeNull();
        expect(resolveReference('nope', new Map())).toBeNull();
    });

    it('formats a reference', () => {
        expect(formatReference({ tableName: 'Stadium', recordIndex: 12 })).toBe(
            'Stadium - 12'
        );
    });
});
