// schema:inspect-add / schema:add / schema:restore-previous
// (main/services/schemaImport). Main derives every plan; the renderer only
// sends the request.

export type GameType = 'madden' | 'college';

export interface GameIdentity {
    gameType: GameType;
    gameYear: number;
}

export interface SchemaIdentity extends GameIdentity {
    major: number;
    minor: number;
}

// Raw Textbox text, so main reports invalid-version / an invalid year itself
export interface AddSchemaOverrides {
    game?: { gameType: GameType; year: string };
    major?: string;
    minor?: string;
}

export interface AddSchemaRequest {
    files: string[];
    overrides: AddSchemaOverrides;
    includeDefaults: boolean;
}

export interface AddSchemaCommit extends AddSchemaRequest {
    // The missing include names the user confirmed
    acceptMissing: string[];
    // The name and replaced paths the user saw
    confirmedTarget: { fileName: string; replaces: string[] };
}

export type SchemaKind = 'copy-gz' | 'generate';

export interface GzFileMeta {
    gameType: GameType | null;
    gameYear: number | null;
    major: number | null;
    minor: number | null;
    databaseName: string | null;
}

export interface GzFacts {
    tables: number;
    // null when the gz has no meta object
    fileMeta: GzFileMeta | null;
}

// schema: a ready .gz; invalid: unreadable or not a schema
export type FileRole = 'schema' | 'entry' | 'include' | 'unused' | 'invalid';

// In detection order (OPTION_SOURCES in main/services/schemaImport/plan.js)
export type OptionSource =
    'ftx-header' | 'gz-meta' | 'file-name' | 'only-game-for-year' | 'open-file';

export type ProblemCode =
    // blocking
    | 'no-files'
    | 'several-schemas'
    | 'mixed-kinds'
    | 'not-a-schema'
    | 'duplicate-name'
    | 'include-cycle'
    | 'several-entrypoints'
    | 'no-entrypoint'
    | 'no-database-name'
    | 'game-required'
    | 'version-required'
    | 'invalid-version'
    | 'malformed-xml'
    | 'empty-enum'
    | 'no-tables'
    | 'missing-changed'
    | 'target-changed'
    // warning
    | 'missing-include'
    | 'version-guessed'
    | 'missing-includes-accepted'
    // info
    | 'meta-written'
    | 'replaces-custom'
    | 'replaces-loaded'
    | 'defaults-merged-at-load';

export type ProblemSeverity = 'blocking' | 'warning' | 'info';

export interface MetaChange {
    field: 'gameType' | 'gameYear' | 'major' | 'minor';
    from: string | number | null;
    to: string | number;
}

export interface Problem {
    code: ProblemCode;
    severity: ProblemSeverity;
    // The row it belongs to, when it is about one file
    path?: string;
    // File names it lists: missing includes, the cycle, replaced or loading files
    files?: string[];
    // meta-written
    changes?: MetaChange[];
    // Parser or library message (malformed-xml, empty-enum)
    detail?: string;
}

export interface PlannedFile {
    path: string;
    name: string;
    role: FileRole;
    // Include names this file declares, in document order
    includes: string[];
    // Its includes that no given file provides
    missing: string[];
}

export interface PlannedOption<T> {
    // The value that will be saved: the override if valid, else detected
    value: T | null;
    detected: T | null;
    source: OptionSource | null;
    // File name the detected value came from
    from: string | null;
    overridden: boolean;
}

export interface LoadedBy {
    fileId: string;
    filePath: string;
}

export interface AddSchemaTarget {
    fileName: string;
    path: string;
    replaces: { path: string; loadedBy: LoadedBy[] }[];
}

export interface AddSchemaPlan {
    kind: SchemaKind | null;
    files: PlannedFile[];
    entry: string | null;
    // Missing include names reachable from the entry
    missing: string[];
    facts: GzFacts | null;
    options: {
        game: PlannedOption<GameIdentity>;
        major: PlannedOption<number>;
        minor: PlannedOption<number>;
    };
    // Every game detected by any source, first one first
    gameCandidates: GameIdentity[];
    includeDefaults: boolean;
    target: AddSchemaTarget | null;
    problems: Problem[];
    canAdd: boolean;
}

export interface AddedSchema {
    identity: SchemaIdentity;
    fileName: string;
    path: string;
    replaced: boolean;
    // Open files that have a replaced copy loaded
    loadedBy: LoadedBy[];
    warnings: Problem[];
}

export type AddSchemaResult =
    | { status: 'added'; added: AddedSchema }
    | { status: 'blocked'; plan: AddSchemaPlan }
    | { error: string };

export type RestoreResult =
    | { status: 'restored'; restored: string[] }
    | { status: 'gone' }
    | { error: string };
