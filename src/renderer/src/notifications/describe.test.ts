import { describe, expect, it } from 'vitest';
import type {
    AppNotification,
    SchemaMismatchData,
    SchemaMissingData
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
            links: [{ id: 'open-schemas', label: 'Open Schema Management' }],
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

function missing(data: Partial<SchemaMissingData> = {}): AppNotification {
    return {
        id: 'n2',
        kind: 'schema-missing',
        createdAt: 0,
        read: false,
        data: {
            path: 'C:\\saves\\FTC-E2ETEST',
            openOptions: { gameYearOverride: 18, gameTypeOverride: 'madden' },
            game: { gameYear: 18, gameType: 'madden' },
            ...data
        }
    };
}

describe('describeNotification schema-missing', () => {
    it('names the file and the game', () => {
        expect(describeNotification(missing())).toEqual({
            title: 'Schema Missing',
            description:
                'FTC-E2ETEST could not be opened because no schema exists for M18.',
            links: [{ id: 'pick-schema', label: 'Choose a schema' }],
            bannerMessage:
                'No schema was found for FTC-E2ETEST. Choose one on the Schema Management page?',
            bannerSeverity: 'error'
        });
    });

    it('says this game when the game is unknown', () => {
        const { description } = describeNotification(
            missing({ game: undefined })
        );
        expect(description).toBe(
            'FTC-E2ETEST could not be opened because no schema exists for this game.'
        );
    });

    it('uses C for college', () => {
        const { description } = describeNotification(
            missing({ game: { gameYear: 26, gameType: 'college' } })
        );
        expect(description).toContain('no schema exists for C26.');
    });
});

describe('describeNotification file-changed', () => {
    it('names the file and offers reload and branch', () => {
        const n: AppNotification = {
            id: 'n3',
            kind: 'file-changed',
            createdAt: 0,
            read: false,
            fileId: 'file-1',
            data: { path: 'C:\\saves\\CAREER-TEST' }
        };
        expect(describeNotification(n)).toEqual({
            title: 'File Changed',
            description: 'CAREER-TEST was changed outside the editor.',
            links: [
                { id: 'reload', label: 'Reload' },
                { id: 'branch', label: 'Branch and save new' }
            ],
            bannerMessage:
                'This save file has been modified outside of this program. Do you want to reload the file?',
            bannerSeverity: 'info'
        });
    });
});
