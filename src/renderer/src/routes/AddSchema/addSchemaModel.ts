import type {
    AddSchemaPlan,
    AddSchemaRequest,
    FileRole,
    GameIdentity,
    GameType,
    OptionSource,
    PlannedOption,
    Problem,
    ProblemSeverity
} from '@shared/types';
import { dirname } from '@renderer/utils/path';
import { pathKey, samePath, yearPrefix } from '../SchemaManagement/schemaList';

export interface GameEntry {
    gameType: string;
    gameYear: number;
    shortTitle: string;
}

export interface GameOption {
    label: string;
    value: string;
}

export const OTHER_GAME = 'other';
export const NO_GAME = '';

export const EMPTY_REQUEST: AddSchemaRequest = {
    files: [],
    overrides: {},
    includeDefaults: true
};

export function addPaths(files: string[], paths: string[]): string[] {
    const next = [...files];
    const seen = new Set(files.map(pathKey));
    for (const path of paths) {
        if (path && !seen.has(pathKey(path))) {
            seen.add(pathKey(path));
            next.push(path);
        }
    }
    return next;
}

export function removePaths(files: string[], paths: string[]): string[] {
    const remove = new Set(paths.map(pathKey));
    return files.filter((existing) => !remove.has(pathKey(existing)));
}

// The request with `entry` set, or without the key for undefined
export function withEntry(
    request: AddSchemaRequest,
    entry: string | undefined
): AddSchemaRequest {
    const next = { ...request, entry };
    if (entry === undefined) delete next.entry;
    return next;
}

// An FTX of the tree that isn't the entry
export function canBeEntry(row: FileRow): boolean {
    return row.role === 'include' || row.role === 'unused';
}

export interface FileRow {
    path: string;
    name: string;
    // Unset until main has planned the file
    role?: FileRole;
    problems: Problem[];
}

export interface FolderGroup {
    // The folder key (pathKey of the dirname); also the React key
    key: string;
    folder: string;
    rows: FileRow[];
}

const SEVERITY_RANK: Record<ProblemSeverity, number> = {
    blocking: 0,
    warning: 1,
    info: 2
};
const NO_PROBLEMS = 3;

// 0 for the worst problems, NO_PROBLEMS for none
function problemRank(rows: FileRow[]): number {
    let rank = NO_PROBLEMS;
    for (const row of rows) {
        for (const problem of row.problems) {
            rank = Math.min(rank, SEVERITY_RANK[problem.severity]);
        }
    }
    return rank;
}

// Stable, so rows of the same rank keep their order
function byProblems<T>(items: T[], rowsOf: (item: T) => FileRow[]): T[] {
    return items
        .map((item, index) => ({
            item,
            index,
            rank: problemRank(rowsOf(item))
        }))
        .sort((a, b) => a.rank - b.rank || a.index - b.index)
        .map(({ item }) => item);
}

// Rows grouped by folder, in the order of each folder's first row. Entries
// come first as their own groups, so a collapsed folder never hides one.
// Rows and groups with problems come next, worst first, so a few problems
// in a folder of thousands are at the top.
export function groupByFolder(rows: FileRow[]): FolderGroup[] {
    const entries: FolderGroup[] = [];
    const groups = new Map<string, FolderGroup>();
    for (const row of rows) {
        const folder = dirname(row.path);
        if (row.role === 'entry') {
            entries.push({ key: pathKey(row.path), folder, rows: [row] });
            continue;
        }
        const key = pathKey(folder);
        const group = groups.get(key);
        if (group) {
            group.rows.push(row);
        } else {
            groups.set(key, { key, folder, rows: [row] });
        }
    }
    const rest = [...groups.values()].map((group) => ({
        ...group,
        rows: byProblems(group.rows, (row) => [row])
    }));
    return [...entries, ...byProblems(rest, (group) => group.rows)];
}

export interface FolderProblems {
    folder: string;
    problems: Problem[];
    // Names of the files with problems
    files: string[];
}

// Folders (more than one file) whose files have problems: those problems
// sit inside a collapsed line, so the footer points at them
export function folderProblems(rows: FileRow[]): FolderProblems[] {
    return groupByFolder(rows)
        .filter((group) => group.rows.length > 1)
        .map((group) => {
            const withProblems = group.rows.filter((r) => r.problems.length);
            return {
                folder: group.folder,
                problems: withProblems.flatMap((r) => r.problems),
                files: withProblems.map((r) => r.name)
            };
        })
        .filter((folder) => folder.problems.length > 0);
}

export function worstSeverity(problems: Problem[]): ProblemSeverity {
    const order: ProblemSeverity[] = ['blocking', 'warning', 'info'];
    return (
        order.find((severity) =>
            problems.some((p) => p.severity === severity)
        ) ?? 'info'
    );
}

export function filterRows(rows: FileRow[], query: string): FileRow[] {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.name.toLowerCase().includes(needle));
}

export function sameFiles(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((path, i) => samePath(path, b[i]));
}

// The Textbox shows what the user typed, else what main will save
export function fieldText(
    override: string | undefined,
    option: PlannedOption<number> | undefined
): string {
    if (override !== undefined) return override;
    return option?.value == null ? '' : String(option.value);
}

export function gameKey(game: { gameType: string; gameYear: number }): string {
    return `${game.gameType}-${game.gameYear}`;
}

export function parseGameKey(key: string): GameIdentity | null {
    const match = /^(madden|college)-(\d+)$/.exec(key);
    return match
        ? { gameType: match[1] as GameType, gameYear: Number(match[2]) }
        : null;
}

export function gameLabel(game: GameIdentity, games: GameEntry[]): string {
    const entry = games.find(
        (g) => g.gameType === game.gameType && g.gameYear === game.gameYear
    );
    return entry?.shortTitle ?? yearPrefix(game.gameType, game.gameYear);
}

// Detected candidates, then the rest of games.json, then the current game if
// neither has it, then "Other game…"
export function gameOptions(
    plan: AddSchemaPlan | null,
    games: GameEntry[],
    current: GameIdentity | null
): GameOption[] {
    const listed: GameIdentity[] = [];
    const push = (game: GameIdentity): void => {
        if (!listed.some((g) => gameKey(g) === gameKey(game))) {
            listed.push(game);
        }
    };
    plan?.gameCandidates.forEach(push);
    games.forEach((g) =>
        push({ gameType: g.gameType as GameType, gameYear: g.gameYear })
    );
    if (current) push(current);

    return [
        ...(current ? [] : [{ label: 'Choose a game', value: NO_GAME }]),
        ...listed.map((game) => ({
            label: gameLabel(game, games),
            value: gameKey(game)
        })),
        { label: 'Other game…', value: OTHER_GAME }
    ];
}

// The game that will be saved: a valid override, else the plan's value
export function currentGame(
    request: AddSchemaRequest,
    plan: AddSchemaPlan | null
): GameIdentity | null {
    const override = request.overrides.game;
    if (override && /^\d+$/.test(override.year)) {
        return { gameType: override.gameType, gameYear: Number(override.year) };
    }
    return plan?.options.game.value ?? null;
}

export function sourceHint(
    option: PlannedOption<unknown> | undefined
): string | null {
    if (!option || option.source === null) return null;
    const from = option.from ?? 'the files';
    const hints: Record<OptionSource, string> = {
        'ftx-header': `From ${from}`,
        'gz-meta': 'From file meta',
        'file-name': 'From file name',
        'only-game-for-year': 'The only game for that year',
        'open-file': `Guessed from ${from}`
    };
    return hints[option.source];
}

export interface SplitProblems {
    byPath: Map<string, Problem[]>;
    general: Problem[];
}

// Row problems go on their row; one whose path has no row stays general.
// `planned` is the plan's own files: a problem on one of those that has no
// row was just removed, and the plan saying so is stale, so it's dropped.
export function splitProblems(
    problems: Problem[],
    paths: string[],
    planned: string[] = []
): SplitProblems {
    const byPath = new Map<string, Problem[]>();
    const general: Problem[] = [];
    const rowsByKey = new Map(paths.map((p) => [pathKey(p), p]));
    const plannedKeys = new Set(planned.map(pathKey));
    for (const problem of problems) {
        const key = problem.path ? pathKey(problem.path) : undefined;
        const row = key ? rowsByKey.get(key) : undefined;
        if (row) {
            byPath.set(row, [...(byPath.get(row) ?? []), problem]);
        } else if (key && plannedKeys.has(key)) {
            continue;
        } else {
            general.push(problem);
        }
    }
    return { byPath, general };
}

export function isBlocked(plan: AddSchemaPlan | null): boolean {
    return (
        !plan ||
        !plan.canAdd ||
        plan.problems.some((p) => p.severity === 'blocking')
    );
}

function count(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function summaryLine(plan: AddSchemaPlan | null): string {
    if (!plan || plan.files.length === 0) {
        return 'Add an entry FTX and its include files, or one .gz schema.';
    }
    const target = plan.target?.fileName;
    const blocked = isBlocked(plan);
    if (!plan.kind || !target) {
        return 'Fix the problems above to add the schema.';
    }

    if (plan.kind === 'generate') {
        const includes = plan.files.filter((f) => f.role === 'include');
        const from = `from 1 entry file and ${count(includes.length, 'include')}`;
        return blocked
            ? `Will generate ${target} ${from} once the problems above are fixed.`
            : `Generates ${target} ${from}${replacing(plan)}.`;
    }

    const source = plan.files.find((f) => f.role === 'schema')?.name;
    const copy =
        source && source.toLowerCase() !== target.toLowerCase()
            ? `${source} as ${target}`
            : target;
    if (blocked) {
        return `Will copy ${copy} once the problems above are fixed.`;
    }
    const writesMeta = plan.problems.some((p) => p.code === 'meta-written');
    return `Copies ${copy}${writesMeta ? ' and writes its meta' : ''}${replacing(plan)}.`;
}

function replacing(plan: AddSchemaPlan): string {
    return plan.target?.replaces.length ? ', replacing your custom copy' : '';
}

export const ROLE_LABELS: Record<FileRole, string> = {
    schema: 'Schema',
    entry: 'Entry',
    include: 'Include',
    unused: 'Not used',
    invalid: "Can't use"
};

// Names past `max` become "and N more", so a tree with thousands of missing
// includes doesn't make a sentence (or a native dialog) thousands long
export const LIST_MAX_NAMES = 5;

export function list(names: string[], max = LIST_MAX_NAMES): string {
    if (names.length <= 1) return names[0] ?? '';
    if (names.length > max) {
        const more = (names.length - max).toLocaleString('en-US');
        return `${names.slice(0, max).join(', ')} and ${more} more`;
    }
    return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// e.g. "M27 365.1", for the confirmation
function identityLabel(plan: AddSchemaPlan): string {
    const { game, major, minor } = plan.options;
    const prefix = game.value
        ? yearPrefix(game.value.gameType, game.value.gameYear)
        : '';
    return `${prefix} ${major.value}.${minor.value}`.trim();
}

// The one confirmation before Add, or null when Add needs none
export function confirmation(
    plan: AddSchemaPlan
): { message: string; detail: string; button: string } | null {
    const missing = plan.missing;
    const replaces = plan.target?.replaces ?? [];
    if (!missing.length && !replaces.length) return null;

    const without = list(missing);
    const missingDetail =
        missing.length === 1
            ? "Tables in that file won't be in the schema."
            : "Tables in those files won't be in the schema.";
    const replaceDetail = [
        'The current copy is kept until your next add, and Undo restores it.',
        ...replaces.map((r) => r.path)
    ].join('\n');
    const label = identityLabel(plan);

    if (!replaces.length) {
        return {
            message: `Generate without ${without}?`,
            detail: missingDetail,
            button: 'Generate'
        };
    }
    if (!missing.length) {
        return {
            message: `Replace your custom ${label}?`,
            detail: replaceDetail,
            button: 'Replace'
        };
    }
    return {
        message: `Replace your custom ${label} and generate without ${without}?`,
        detail: `${missingDetail}\n\n${replaceDetail}`,
        button: 'Add'
    };
}
