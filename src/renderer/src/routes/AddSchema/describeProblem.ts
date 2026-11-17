import type { MetaChange, Problem, ProblemCode } from '@shared/types';
import { yearPrefix } from '../SchemaManagement/schemaList';
import { list } from './addSchemaModel';

export type ProblemPhase = 'plan' | 'result';

function pair(
    a: MetaChange | undefined,
    b: MetaChange | undefined,
    side: 'from' | 'to',
    join: (x: string | number | null, y: string | number | null) => string
): string {
    const x = a ? a[side] : null;
    const y = b ? b[side] : null;
    return x === null && y === null ? 'none' : join(x, y);
}

// "Game: none → M27, Version: none → 620.0". A field that doesn't change
// isn't in the list, so a pair with one change shows "?" for the other.
export function describeChanges(changes: MetaChange[]): string {
    const by = (field: MetaChange['field']) =>
        changes.find((c) => c.field === field);
    const parts: string[] = [];
    const type = by('gameType');
    const year = by('gameYear');
    if (type || year) {
        const game = (side: 'from' | 'to') =>
            pair(type, year, side, (t, y) =>
                yearPrefix(t === null ? null : String(t), y ?? '?')
            );
        parts.push(`Game: ${game('from')} → ${game('to')}`);
    }
    const major = by('major');
    const minor = by('minor');
    if (major || minor) {
        const version = (side: 'from' | 'to') =>
            pair(major, minor, side, (a, b) => `${a ?? '?'}.${b ?? '?'}`);
        parts.push(`Version: ${version('from')} → ${version('to')}`);
    }
    return parts.join(', ');
}

type Describe = (problem: Problem, names: string) => string;

// Advice before Add. A row problem shows on its row, so it doesn't name it.
const PLAN_TEXT: Record<ProblemCode, Describe> = {
    'no-files': () =>
        'Add an entry FTX and its include files, or one .gz schema.',
    'several-schemas': () => 'Add one .gz schema at a time.',
    'mixed-kinds': () =>
        "A .gz schema can't be added together with FTX files. Remove one kind.",
    'not-a-schema': () => 'Not a schema or FTX file.',
    'duplicate-name': (_, names) =>
        `${names || 'Two files'} have the same include name. Remove one.`,
    'include-cycle': (p) =>
        `These files include each other: ${(p.files ?? []).join(' → ')}.`,
    'several-entrypoints': (_, names) =>
        `More than one file could be the entry: ${names}. Remove the ones you don't need.`,
    'no-entrypoint': () =>
        'Every file is included by another one, so there is no entry file.',
    'no-database-name': () =>
        'No FTX file has a databaseName. Add the entry file that has it.',
    'game-required': () => 'Choose the game.',
    'version-required': () => 'Enter the major and minor version.',
    'invalid-version': () =>
        'The year, major and minor must be whole numbers, 0 or more.',
    'malformed-xml': (p) => `Not valid XML${p.detail ? `: ${p.detail}` : '.'}`,
    'empty-enum': (p) =>
        `An enum has no values${p.detail ? ` (${p.detail})` : ''}. The editor can't load a schema with an empty enum.`,
    'no-tables': () => 'The files define no tables.',
    'missing-changed': () =>
        'The missing include files changed after you confirmed. Check the list and add again.',
    'target-changed': () =>
        'Your custom schemas changed after you confirmed. Check the plan and add again.',
    'missing-include': (_, names) =>
        `Still needed: ${names}. You can add without ${names.includes(' and ') ? 'them' : 'it'}, but its tables won't be in the schema.`,
    'version-guessed': (_, names) =>
        `This file doesn't say which version it is. The version was taken from ${names || 'the open file'}. Check it before adding.`,
    'missing-includes-accepted': (_, names) => `Generated without ${names}.`,
    'meta-written': (p) =>
        `Writes the file's meta. ${describeChanges(p.changes ?? [])}.`,
    'replaces-custom': (_, names) =>
        `Replaces your custom ${names}. The current copy is kept until your next add, and Undo restores it.`,
    'replaces-loaded': (_, names) =>
        `${names} is loaded by an open file. That file keeps its copy until you load the new one.`,
    'defaults-merged-at-load': () =>
        'The editor still adds the default tables when it loads the schema.'
};

// Done, not advice, in the success banner
const RESULT_TEXT: Partial<Record<ProblemCode, Describe>> = {
    'version-guessed': (_, names) =>
        `The version was guessed from ${names || 'the open file'}.`,
    'missing-include': (_, names) => `Generated without ${names}.`,
    'meta-written': (p) =>
        `Wrote the file's meta. ${describeChanges(p.changes ?? [])}.`
};

export function describeProblem(problem: Problem, phase: ProblemPhase): string {
    const names = list(problem.files ?? []);
    const text =
        (phase === 'result' && RESULT_TEXT[problem.code]) ||
        PLAN_TEXT[problem.code];
    return text(problem, names);
}
