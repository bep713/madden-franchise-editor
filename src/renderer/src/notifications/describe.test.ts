import { describe, expect, it } from 'vitest';
import type {
    AppNotification,
    SchemaMismatchData
} from '@shared/types/notifications';
import { describeNotification } from './describe';

function mismatch(data: Partial<SchemaMismatchData> = {}): AppNotification {
    return {
        id: 'n1',
        kind: 'schema-mismatch',
        createdAt: 0,
        read: false,
        fileId: 'file-1',
        data: {
            expected: { gameYear: 22, major: 328, minor: 1 },
            loaded: { gameYear: 22, major: 329, minor: 1 },
            gameType: 'madden',
            ...data
        }
    };
}

describe('describeNotification schema-mismatch', () => {
    it('labels the loaded and expected schemas', () => {
        expect(describeNotification(mismatch())).toEqual({
            title: 'Schema Mismatch',
            description: 'Loaded M22 v329.1, expected M22 v328.1.',
            linkLabel: 'Open Schema Management',
            bannerMessage:
                "We cannot find an exact match for this file's schema. Open the schema management page?",
            bannerSeverity: 'error'
        });
    });

    it('drops the year when the file expects none', () => {
        const { description } = describeNotification(
            mismatch({ expected: { gameYear: null, major: 328, minor: 1 } })
        );
        expect(description).toBe('Loaded M22 v329.1, expected v328.1.');
    });

    it('reads none and unknown for missing metas', () => {
        const { description } = describeNotification(
            mismatch({ loaded: null, expected: null })
        );
        expect(description).toBe('Loaded none, expected unknown.');
    });

    it('uses C for college', () => {
        const { description } = describeNotification(
            mismatch({
                gameType: 'college',
                expected: { gameYear: 27, major: 10, minor: 2 },
                loaded: { gameYear: 27, major: 11, minor: 0 }
            })
        );
        expect(description).toBe('Loaded C27 v11.0, expected C27 v10.2.');
    });
});
