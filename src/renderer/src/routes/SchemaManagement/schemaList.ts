import type {
    FileMetadata,
    GameVersion,
    SchemaEntry,
    SchemaMeta
} from '@shared/types';
import { basename } from '@renderer/utils/path';

export interface SchemaGroup {
    game: GameVersion;
    schemas: SchemaEntry[];
}

// Windows paths: no case, either slash
export function samePath(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false;
    const normalize = (p: string): string =>
        p.replace(/\\/g, '/').toLowerCase();
    return normalize(a) === normalize(b);
}

// Files without a gameType are Madden, as in findGame
function gameTypeOf(metadata: FileMetadata): string {
    return metadata.type?.gameType || 'madden';
}

function yearPrefix(gameType: string | null, gameYear: unknown): string {
    return `${gameType === 'college' ? 'C' : 'M'}${gameYear}`;
}

// e.g. "M22 v329.1", or "v329.1" when the meta has no year
export function metaLabel(
    meta: SchemaMeta | SchemaEntry,
    gameType: string | null
): string {
    const version = `v${meta.major}.${meta.minor}`;
    return meta.gameYear
        ? `${yearPrefix(gameType, meta.gameYear)} ${version}`
        : version;
}

function isTwin(a: SchemaEntry, b: SchemaEntry): boolean {
    return (
        a.gameType === b.gameType &&
        a.gameYear === b.gameYear &&
        a.major === b.major &&
        a.minor === b.minor
    );
}

// The label without a file name, with " (Custom)" when a bundled copy of the
// same version exists
function baseLabel(entry: SchemaEntry, entries: SchemaEntry[]): string {
    const label = metaLabel(entry, entry.gameType);
    const hasBundledTwin =
        entry.source === 'custom' &&
        entries.some(
            (other) => other.source === 'bundled' && isTwin(entry, other)
        );
    return hasBundledTwin ? `${label} (Custom)` : label;
}

// Custom entries: relative to the schema dir, so subfolders tell apart
function fileName(entry: SchemaEntry, customDir?: string): string {
    if (entry.source === 'custom' && customDir) {
        const dir = customDir.replace(/\\/g, '/').replace(/\/+$/, '');
        const path = entry.path.replace(/\\/g, '/');
        if (path.toLowerCase().startsWith(`${dir.toLowerCase()}/`)) {
            return path.slice(dir.length + 1);
        }
    }
    return basename(entry.path);
}

// e.g. "M25 v219.2", "v220.0" (untyped), "M22 v329.1 (Custom)". Entries that
// would share a label get their file name added:
// "M22 v329.1 (Custom, old/M22_329_1.gz)".
export function schemaLabel(
    entry: SchemaEntry,
    entries: SchemaEntry[],
    customDir?: string
): string {
    const label = baseLabel(entry, entries);
    const duplicates = entries.filter(
        (other) => baseLabel(other, entries) === label
    ).length;
    if (duplicates < 2) {
        return label;
    }
    const name = fileName(entry, customDir);
    return label.endsWith(' (Custom)')
        ? `${label.slice(0, -1)}, ${name})`
        : `${label} (${name})`;
}

// Version descending, then custom first. Array.sort is stable, so ties keep
// the getSavedSchemas order, as schemaPicker.pick does.
function compareSchemas(a: SchemaEntry, b: SchemaEntry): number {
    return (
        b.major - a.major ||
        b.minor - a.minor ||
        Number(b.source === 'custom') - Number(a.source === 'custom')
    );
}

// One group per supported game with schemas, newest first and Madden before
// College. Everything else (untyped, unsupported or unknown games) is Other,
// since schemaPicker still reads those files.
export function groupSchemas(
    entries: SchemaEntry[],
    games: GameVersion[]
): { groups: SchemaGroup[]; other: SchemaEntry[] } {
    const grouped = new Set<SchemaEntry>();
    const groups = games
        .filter((game) => game.isSupported)
        .map((game) => {
            const schemas = entries
                .filter(
                    (entry) =>
                        entry.gameType === game.gameType &&
                        entry.gameYear === game.gameYear
                )
                .sort(compareSchemas);
            schemas.forEach((entry) => grouped.add(entry));
            return { game, schemas };
        })
        .filter((group) => group.schemas.length > 0)
        .sort(
            (a, b) =>
                b.game.gameYear - a.game.gameYear ||
                Number(a.game.gameType === 'college') -
                    Number(b.game.gameType === 'college')
        );
    const other = entries
        .filter((entry) => !grouped.has(entry))
        .sort(compareSchemas);
    return { groups, other };
}

// By path, since a custom copy and its bundled twin share a version
export function isLoaded(
    entry: SchemaEntry,
    metadata?: FileMetadata | null
): boolean {
    return samePath(entry.path, metadata?.schemaList?.path);
}

// v4's rule (schemaViewerService.manageSchemaVersionInfo): major and minor
// match, and the year too when the file expects one
export function matchesExpected(
    meta?: SchemaMeta | null,
    expected?: SchemaMeta | null
): boolean {
    if (!meta || !expected) return false;
    return (
        meta.major === expected.major &&
        meta.minor === expected.minor &&
        (!expected.gameYear ||
            Number(meta.gameYear) === Number(expected.gameYear))
    );
}

// The schema to load for the file's expected version: a typed custom one,
// then typed bundled, then untyped (matched on major/minor, as schemaPicker
// treats them as any year)
export function findExpectedSchema(
    entries: SchemaEntry[],
    metadata?: FileMetadata | null
): SchemaEntry | null {
    const expected = metadata?.expectedSchemaVersion;
    if (!metadata || !expected) return null;
    const gameType = gameTypeOf(metadata);
    const typed = entries.filter(
        (entry) =>
            entry.gameType === gameType && matchesExpected(entry, expected)
    );
    const untyped = entries.filter(
        (entry) =>
            entry.gameType === null &&
            entry.major === expected.major &&
            entry.minor === expected.minor
    );
    return (
        typed.find((entry) => entry.source === 'custom') ??
        typed.find((entry) => entry.source === 'bundled') ??
        untyped[0] ??
        null
    );
}

// The loaded schema's row label, or one built from the meta (an embedded
// schema, or one from outside both dirs)
export function loadedLabel(
    metadata: FileMetadata | null | undefined,
    entries: SchemaEntry[],
    customDir?: string
): string {
    const schemaList = metadata?.schemaList;
    if (!metadata || !schemaList?.meta) return 'None';
    const entry = entries.find((e) => isLoaded(e, metadata));
    return entry
        ? schemaLabel(entry, entries, customDir)
        : metaLabel(schemaList.meta, gameTypeOf(metadata));
}

// No year when the file doesn't expect one (v4 shows "ANY")
export function expectedLabel(metadata?: FileMetadata | null): string {
    const expected = metadata?.expectedSchemaVersion;
    if (!metadata || !expected) return 'Unknown';
    return metaLabel(expected, gameTypeOf(metadata));
}
