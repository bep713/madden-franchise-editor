import { describe, expect, it } from 'vitest';
import type { FileMetadata, GameVersion, SchemaEntry } from '@shared/types';
import {
    expectedLabel,
    findExpectedSchema,
    groupSchemas,
    isLoaded,
    loadedLabel,
    matchesExpected,
    samePath,
    schemaLabel
} from './schemaList';

const DIR = 'C:\\Users\\me\\AppData\\Roaming\\mfe\\schemas';

function entry(name: string, patch: Partial<SchemaEntry> = {}): SchemaEntry {
    // M22_329_1.gz, or 329_1.gz untyped
    const typed = /^([MC])(\d+)_(\d+)_(\d+)/.exec(name);
    const [major, minor] = typed
        ? [typed[3], typed[4]]
        : /^(\d+)_(\d+)/.exec(name)!.slice(1);
    return {
        gameType: typed ? (typed[1] === 'C' ? 'college' : 'madden') : null,
        gameYear: typed ? Number(typed[2]) : null,
        major: Number(major),
        minor: Number(minor),
        path: `C:\\app\\data\\schemas\\${name}`,
        source: 'bundled',
        ...patch
    };
}

function custom(name: string): SchemaEntry {
    return entry(name.split('/').pop()!, {
        path: `${DIR}\\${name.replace(/\//g, '\\')}`,
        source: 'custom'
    });
}

function game(gameType: string, gameYear: number, isSupported = true) {
    return {
        gameType,
        gameYear,
        isSupported,
        shortTitle: `${gameType} ${gameYear}`
    } as GameVersion;
}

const GAMES = [
    game('madden', 18, false),
    game('madden', 22),
    game('madden', 25),
    game('college', 25)
];

function meta(
    patch: Partial<FileMetadata> = {},
    gameType = 'madden'
): FileMetadata {
    return {
        gameYear: 22,
        type: { gameType },
        expectedSchemaVersion: { gameYear: 22, major: 329, minor: 1 },
        schemaList: null,
        ...patch
    } as FileMetadata;
}

describe('schemaLabel', () => {
    it('labels typed, college and untyped entries', () => {
        const entries = [
            entry('M25_219_2.gz'),
            entry('C25_12_0.gz'),
            custom('220_0.gz')
        ];
        expect(entries.map((e) => schemaLabel(e, entries, DIR))).toEqual([
            'M25 v219.2',
            'C25 v12.0',
            'v220.0'
        ]);
    });

    it('marks a custom entry with a bundled twin', () => {
        const entries = [entry('M22_329_1.gz'), custom('M22_329_1.gz')];
        expect(schemaLabel(entries[1], entries, DIR)).toBe(
            'M22 v329.1 (Custom)'
        );
        expect(schemaLabel(entries[0], entries, DIR)).toBe('M22 v329.1');
        // No twin: no marker
        expect(schemaLabel(custom('M22_330_0.gz'), entries, DIR)).toBe(
            'M22 v330.0'
        );
    });

    it('adds file names to labels that would be the same', () => {
        const entries = [
            entry('M22_329_1.gz'),
            custom('M22_329_1.gz'),
            custom('old/M22_329_1.gz'),
            custom('M25_219_2.gz'),
            custom('M25_219_2.xml'),
            custom('M24_100_0.gz'),
            custom('M24_100_0 - Copy.gz'),
            custom('M23_1_0.gz')
        ];
        expect(entries.map((e) => schemaLabel(e, entries, DIR))).toEqual([
            'M22 v329.1',
            'M22 v329.1 (Custom, M22_329_1.gz)',
            'M22 v329.1 (Custom, old/M22_329_1.gz)',
            'M25 v219.2 (M25_219_2.gz)',
            'M25 v219.2 (M25_219_2.xml)',
            'M24 v100.0 (M24_100_0.gz)',
            'M24 v100.0 (M24_100_0 - Copy.gz)',
            'M23 v1.0'
        ]);
    });

    it('uses base names without a schema dir', () => {
        const entries = [custom('M22_329_1.gz'), custom('old/M22_329_1.gz')];
        expect(schemaLabel(entries[1], entries)).toBe(
            'M22 v329.1 (M22_329_1.gz)'
        );
    });
});

describe('groupSchemas', () => {
    it('groups supported games, newest first and Madden before College', () => {
        const entries = [
            entry('M22_329_1.gz'),
            entry('C25_12_0.gz'),
            entry('M25_219_2.gz')
        ];
        const { groups, other } = groupSchemas(entries, GAMES);
        expect(
            groups.map((g) => [g.game.shortTitle, g.schemas.length])
        ).toEqual([
            ['madden 25', 1],
            ['college 25', 1],
            ['madden 22', 1]
        ]);
        expect(other).toEqual([]);
    });

    it('sorts by version, then custom first, keeping the scan order', () => {
        const sub = custom('old/M22_329_1.gz');
        const root = custom('M22_329_1.gz');
        const bundled = entry('M22_329_1.gz');
        const older = entry('M22_200_0.gz');
        const newer = entry('M22_329_5.gz');
        const { groups } = groupSchemas(
            [older, bundled, sub, root, newer],
            GAMES
        );
        expect(groups[0].schemas).toEqual([newer, sub, root, bundled, older]);
    });

    it('puts untyped, unsupported and unknown games in Other', () => {
        const untyped = custom('220_0.gz');
        const m18 = entry('M18_95_1.gz');
        const m28 = custom('M28_1_0.gz');
        const entries = [untyped, m18, m28, entry('M22_329_1.gz')];
        const { groups, other } = groupSchemas(entries, GAMES);
        expect(groups).toHaveLength(1);
        expect(other).toEqual(expect.arrayContaining([untyped, m18, m28]));
        expect(other).toHaveLength(3);
        expect(schemaLabel(m18, entries, DIR)).toBe('M18 v95.1');
    });
});

describe('paths', () => {
    it('compares paths without case or slash direction', () => {
        expect(samePath('C:\\A\\b.gz', 'c:/a/B.GZ')).toBe(true);
        expect(samePath('C:\\A\\b.gz', 'C:\\A\\c.gz')).toBe(false);
        expect(samePath(undefined, 'x')).toBe(false);
    });

    it('marks the loaded entry by path, not version', () => {
        const bundled = entry('M22_329_1.gz');
        const copy = custom('M22_329_1.gz');
        const metadata = meta({
            schemaList: {
                meta: { gameYear: 22, major: 329, minor: 1 },
                path: copy.path.toLowerCase()
            }
        });
        expect(isLoaded(copy, metadata)).toBe(true);
        expect(isLoaded(bundled, metadata)).toBe(false);
        expect(isLoaded(copy, undefined)).toBe(false);
    });
});

describe('matchesExpected', () => {
    const used = { gameYear: 22, major: 329, minor: 1 };

    it('needs major, minor and year', () => {
        expect(matchesExpected(used, { ...used })).toBe(true);
        expect(matchesExpected(used, { ...used, minor: 2 })).toBe(false);
        expect(matchesExpected(used, { ...used, gameYear: 23 })).toBe(false);
        expect(matchesExpected(used, { ...used, gameYear: '22' })).toBe(true);
    });

    it('ignores the year when none is expected', () => {
        expect(matchesExpected(used, { ...used, gameYear: null })).toBe(true);
    });

    it('fails without either side', () => {
        expect(matchesExpected(null, used)).toBe(false);
        expect(matchesExpected(used, null)).toBe(false);
    });
});

describe('findExpectedSchema', () => {
    it('prefers a typed custom entry, then bundled', () => {
        const bundled = entry('M22_329_1.gz');
        const copy = custom('M22_329_1.gz');
        expect(findExpectedSchema([bundled, copy], meta())).toBe(copy);
        expect(findExpectedSchema([bundled], meta())).toBe(bundled);
    });

    it('respects the game type', () => {
        const college = entry('C22_329_1.gz');
        expect(findExpectedSchema([college], meta())).toBeNull();
        expect(findExpectedSchema([college], meta({}, 'college'))).toBe(
            college
        );
        // No type means Madden
        const madden = entry('M22_329_1.gz');
        expect(
            findExpectedSchema([madden], meta({ type: undefined } as never))
        ).toBe(madden);
    });

    it('falls back to an untyped entry only without a typed one', () => {
        const untyped = custom('329_1.gz');
        const bundled = entry('M22_329_1.gz');
        expect(findExpectedSchema([untyped], meta())).toBe(untyped);
        expect(findExpectedSchema([untyped, bundled], meta())).toBe(bundled);
    });

    it('is null without an expected version or a match', () => {
        const bundled = entry('M22_329_1.gz');
        expect(
            findExpectedSchema([bundled], meta({ expectedSchemaVersion: null }))
        ).toBeNull();
        expect(findExpectedSchema([entry('M22_330_0.gz')], meta())).toBeNull();
        expect(findExpectedSchema([bundled], undefined)).toBeNull();
    });
});

describe('loaded and expected labels', () => {
    it('uses the loaded entry label, or the meta', () => {
        const bundled = entry('M22_329_1.gz');
        const copy = custom('M22_329_1.gz');
        const entries = [bundled, copy];
        const schemaMeta = { gameYear: 22, major: 329, minor: 1 };
        expect(
            loadedLabel(
                meta({ schemaList: { meta: schemaMeta, path: copy.path } }),
                entries,
                DIR
            )
        ).toBe('M22 v329.1 (Custom)');
        // An embedded schema
        expect(
            loadedLabel(
                meta({ schemaList: { meta: schemaMeta, path: '' } }),
                entries,
                DIR
            )
        ).toBe('M22 v329.1');
        expect(loadedLabel(meta(), entries)).toBe('None');
        expect(loadedLabel(undefined, entries)).toBe('None');
    });

    it('drops the year when none is expected', () => {
        expect(expectedLabel(meta())).toBe('M22 v329.1');
        expect(expectedLabel(meta({}, 'college'))).toBe('C22 v329.1');
        expect(
            expectedLabel(
                meta({
                    expectedSchemaVersion: {
                        gameYear: null,
                        major: 329,
                        minor: 1
                    }
                })
            )
        ).toBe('v329.1');
        expect(expectedLabel(meta({ expectedSchemaVersion: null }))).toBe(
            'Unknown'
        );
    });
});
