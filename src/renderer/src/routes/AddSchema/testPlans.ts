import type {
    AddSchemaPlan,
    GameIdentity,
    PlannedFile,
    PlannedOption
} from '@shared/types';

// Plans as main would send them, for the AddSchema tests

export const DIR = 'C:\\ftx';
export const M27: GameIdentity = { gameType: 'madden', gameYear: 27 };

export function option<T>(
    value: T | null,
    extra: Partial<PlannedOption<T>> = {}
): PlannedOption<T> {
    return {
        value,
        detected: value,
        source: value === null ? null : 'ftx-header',
        from: value === null ? null : 'MAIN.FTX',
        overridden: false,
        ...extra
    };
}

export function plannedFile(
    name: string,
    role: PlannedFile['role'],
    extra: Partial<PlannedFile> = {}
): PlannedFile {
    return {
        path: `${DIR}\\${name}`,
        name,
        role,
        includes: [],
        missing: [],
        ...extra
    };
}

export function generatePlan(
    extra: Partial<AddSchemaPlan> = {}
): AddSchemaPlan {
    return {
        kind: 'generate',
        files: [
            plannedFile('MAIN.FTX', 'entry', { includes: ['Teams'] }),
            plannedFile('Teams.FTX', 'include')
        ],
        entry: `${DIR}\\MAIN.FTX`,
        missing: [],
        facts: null,
        options: {
            game: option(M27),
            major: option(900),
            minor: option(1)
        },
        gameCandidates: [M27],
        includeDefaults: true,
        target: {
            fileName: 'M27_900_1.gz',
            path: 'C:\\userData\\schemas\\M27_900_1.gz',
            replaces: []
        },
        problems: [],
        canAdd: true,
        ...extra
    };
}

export function gzPlan(extra: Partial<AddSchemaPlan> = {}): AddSchemaPlan {
    return {
        ...generatePlan(),
        kind: 'copy-gz',
        files: [plannedFile('C27_468_2.gz', 'schema')],
        entry: null,
        facts: {
            tables: 1234,
            fileMeta: {
                gameType: 'college',
                gameYear: 27,
                major: 468,
                minor: 2,
                databaseName: 'CollegeFB27'
            }
        },
        options: {
            game: option<GameIdentity>(
                { gameType: 'college', gameYear: 27 },
                { source: 'gz-meta', from: 'C27_468_2.gz' }
            ),
            major: option(468, { source: 'gz-meta', from: 'C27_468_2.gz' }),
            minor: option(2, { source: 'gz-meta', from: 'C27_468_2.gz' })
        },
        gameCandidates: [{ gameType: 'college', gameYear: 27 }],
        target: {
            fileName: 'C27_468_2.gz',
            path: 'C:\\userData\\schemas\\C27_468_2.gz',
            replaces: []
        },
        ...extra
    };
}
