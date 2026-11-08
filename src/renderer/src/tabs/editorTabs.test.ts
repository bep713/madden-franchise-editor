import { describe, expect, it } from 'vitest';
import { FileMetadata, FileType } from '@shared/types';
import {
    EditorTabsState,
    TabAction,
    TabsFile,
    getActiveTab,
    initialTabsState,
    reduceTabs,
    syncFile,
    tabName
} from './editorTabs';

function makeFile(
    fileId = 'file-1',
    {
        format = FileType.FRANCHISE,
        gameYear = 22,
        gameType = 'madden',
        revision = 0
    }: {
        format?: FileType;
        gameYear?: number;
        gameType?: string;
        revision?: number;
    } = {}
): TabsFile {
    return {
        fileId,
        revision,
        metadata: {
            gameYear,
            format,
            type: { format, year: gameYear, compressed: true, gameType }
        } as FileMetadata
    };
}

const FILE = makeFile();

// Applies actions in order, all for the same file. null: no file open.
function run(
    actions: TabAction[],
    file: TabsFile | null = FILE,
    state: EditorTabsState = syncFile(initialTabsState, file ?? undefined)
): EditorTabsState {
    return actions.reduce(
        (s, action) => reduceTabs(s, action, file ?? undefined),
        state
    );
}

const names = (state: EditorTabsState) => state.tabs.map(tabName);
const activeName = (state: EditorTabsState) => tabName(getActiveTab(state));

const open = { type: 'openTableEditor' } as const;
const newTab = { type: 'newTab' } as const;
const select = (key: string) => ({ type: 'selectTab', key }) as const;
const close = (key: string) => ({ type: 'closeTab', key }) as const;
const openTable = (tableId: number, name: string, background = false) =>
    ({ type: 'openTableTab', tableId, name, background }) as const;
const changed = (key: string, tableId: number, name: string) =>
    ({ type: 'tableChanged', key, tableId, name }) as const;

function keyOf(state: EditorTabsState, name: string): string {
    const tab = state.tabs.find((t) => tabName(t) === name);
    if (!tab) {
        throw new Error(`No tab ${name}`);
    }
    return tab.key;
}

describe('editorTabs', () => {
    describe('fresh tab set', () => {
        it('shows only Home and Schemas without a file', () => {
            const state = run([open, newTab], null);
            expect(names(state)).toEqual(['Home', 'Schemas']);
            expect(activeName(state)).toBe('Home');
        });

        it('has every main tab for a Madden franchise file', () => {
            const state = reduceTabs(initialTabsState, select('home'), FILE);
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'Open Table...'
            ]);
            expect(activeName(state)).toBe('Home');
        });

        it('has no Schedule for a common file', () => {
            const state = reduceTabs(
                initialTabsState,
                select('home'),
                makeFile('c', { format: FileType.COMMON })
            );
            expect(names(state)).toEqual(['Home', 'Schemas', 'Open Table...']);
        });

        it('has no Schedule for a CFB franchise file', () => {
            const state = reduceTabs(
                initialTabsState,
                select('home'),
                makeFile('cfb', { gameYear: 27, gameType: 'cfb' })
            );
            expect(names(state)).toEqual(['Home', 'Schemas', 'Open Table...']);
        });

        it('resets when the file changes', () => {
            const before = run([open, newTab]);
            expect(before.tabs).toHaveLength(5);

            const after = reduceTabs(
                before,
                select('home'),
                makeFile('file-2')
            );
            expect(names(after)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'Open Table...'
            ]);
            expect(activeName(after)).toBe('Home');
            expect(after.fileId).toBe('file-2');
        });

        it('applies an action for a new file to its fresh tab set', () => {
            const before = run([open, newTab]);
            const after = reduceTabs(before, open, makeFile('file-2'));
            expect(names(after)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'New Tab'
            ]);
        });

        it('is a no-op for the same file and revision', () => {
            const state = run([open, newTab]);
            expect(syncFile(state, makeFile())).toBe(state);
        });

        it('keeps the active main tab and drops table tabs on a reopen', () => {
            // Schemas isn't implemented yet, so it can't be selected
            const state = {
                ...run([open, newTab]),
                activeKey: 'schema-management'
            };
            const after = syncFile(state, makeFile('file-1', { revision: 1 }));
            expect(names(after)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'Open Table...'
            ]);
            expect(activeName(after)).toBe('Schemas');
            expect(after.revision).toBe(1);
            expect(after.nextId).toBe(state.nextId);
        });

        it('goes Home on a reopen while a table tab is active', () => {
            const before = run([open]);
            expect(getActiveTab(before).kind).toBe('table');
            const after = syncFile(before, makeFile('file-1', { revision: 1 }));
            expect(names(after)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'Open Table...'
            ]);
            expect(activeName(after)).toBe('Home');
        });

        it('goes Home for a new file, whatever was active', () => {
            const state = {
                ...run([open, newTab]),
                activeKey: 'schema-management'
            };
            const after = syncFile(state, makeFile('file-2'));
            expect(activeName(after)).toBe('Home');
        });

        it('drops every tab but Home and Schemas when the file is closed', () => {
            const state = run([open], null, run([open, newTab]));
            expect(names(state)).toEqual(['Home', 'Schemas']);
        });
    });

    describe('Open Table...', () => {
        it('replaces the placeholder with an active new tab', () => {
            const state = run([open]);
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'New Tab'
            ]);
            expect(activeName(state)).toBe('New Tab');
            expect(getActiveTab(state).kind).toBe('table');
        });

        it('works the same when the placeholder tab is clicked', () => {
            expect(names(run([select('table-editor')]))).toEqual(
                names(run([open]))
            );
        });

        it('reuses the new tab when "+" is clicked while the placeholder exists', () => {
            const state = run([newTab]);
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'New Tab'
            ]);
            expect(activeName(state)).toBe('New Tab');
        });

        it('never brings the placeholder back', () => {
            let state = run([open]);
            state = run(
                [close(getActiveTab(state).key), select('home')],
                FILE,
                state
            );
            expect(names(state)).toEqual(['Home', 'Schedule', 'Schemas']);
            expect(names(run([open], FILE, state))).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'New Tab'
            ]);
        });

        it('activates the first table tab when on Home', () => {
            let state = run([open]);
            state = run(
                [changed(getActiveTab(state).key, 7482, 'Team'), newTab],
                FILE,
                state
            );
            state = run(
                [
                    changed(getActiveTab(state).key, 4097, 'X'),
                    select('home'),
                    open
                ],
                FILE,
                state
            );
            expect(activeName(state)).toBe('7482 - Team');
        });

        it('keeps the active table tab', () => {
            let state = run([open, newTab]);
            const active = state.activeKey;
            state = run([open], FILE, state);
            expect(state.activeKey).toBe(active);
        });
    });

    describe('new tab', () => {
        it('adds an active tab at the end, before "+"', () => {
            let state = run([open]);
            state = run(
                [changed(state.activeKey, 7482, 'Team'), newTab],
                FILE,
                state
            );
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                '7482 - Team',
                'New Tab'
            ]);
            expect(activeName(state)).toBe('New Tab');
        });

        it('never reuses a key', () => {
            let state = run([open]);
            const first = state.activeKey;
            state = run([close(first), newTab], FILE, state);
            expect(state.activeKey).not.toBe(first);
        });
    });

    describe('open table in a new tab', () => {
        it('appends an active tab for the table', () => {
            let state = run([open]);
            state = run(
                [changed(state.activeKey, 4096, ''), openTable(7482, 'Team')],
                FILE,
                state
            );
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                '4096',
                '7482 - Team'
            ]);
            expect(activeName(state)).toBe('7482 - Team');
            const tab = getActiveTab(state);
            expect(tab.kind === 'table' && tab.tableId).toBe(7482);
        });

        it('keeps the active tab for a background open', () => {
            let state = run([open]);
            const active = state.activeKey;
            state = run([openTable(4104, 'Stadium', true)], FILE, state);
            expect(state.activeKey).toBe(active);
            expect(names(state)).toContain('4104 - Stadium');
        });

        it('does nothing without a file', () => {
            const state = run([], null);
            expect(run([openTable(7482, 'Team')], null, state)).toBe(state);
        });

        it('drops the placeholder', () => {
            const state = run([openTable(7482, 'Team', true)]);
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                '7482 - Team'
            ]);
            expect(activeName(state)).toBe('Home');
        });

        it('never reuses a key', () => {
            let state = run([open]);
            const first = state.activeKey;
            state = run(
                [openTable(7482, 'Team'), openTable(4104, 'Stadium')],
                FILE,
                state
            );
            const keys = state.tabs.map((tab) => tab.key);
            expect(new Set(keys).size).toBe(keys.length);
            expect(keys).toContain(first);
        });
    });

    describe('select', () => {
        it('activates a tab', () => {
            let state = run([open]);
            const first = state.activeKey;
            state = run([newTab, select(first)], FILE, state);
            expect(state.activeKey).toBe(first);
        });

        it('does nothing for the active tab', () => {
            const state = run([open]);
            expect(reduceTabs(state, select(state.activeKey), FILE)).toBe(
                state
            );
        });

        it('does nothing for a page React does not have yet', () => {
            const state = run([]);
            expect(reduceTabs(state, select('schedule-editor'), FILE)).toBe(
                state
            );
        });

        it('selects Schemas, with or without a file', () => {
            expect(activeName(run([select('schema-management')]))).toBe(
                'Schemas'
            );
            expect(activeName(run([select('schema-management')], null))).toBe(
                'Schemas'
            );
        });
    });

    describe('close', () => {
        it('activates the tab to the left when closing the active tab', () => {
            let state = run([open]);
            state = run(
                [changed(state.activeKey, 7482, 'Team'), newTab],
                FILE,
                state
            );
            state = run([close(state.activeKey)], FILE, state);
            expect(activeName(state)).toBe('7482 - Team');
            expect(state.tabs).toHaveLength(4);
        });

        it('activates Schemas, the tab to the left', () => {
            let state = run([open]);
            state = run([close(state.activeKey)], FILE, state);
            expect(activeName(state)).toBe('Schemas');
        });

        it('skips stub tabs to the left, back to Home', () => {
            let state = run([open]);
            // Home, Schedule (a stub), New Tab
            state = {
                ...state,
                tabs: state.tabs.filter(
                    (tab) => tab.key !== 'schema-management'
                )
            };
            state = run([close(state.activeKey)], FILE, state);
            expect(activeName(state)).toBe('Home');
        });

        it('keeps the active tab when closing another one', () => {
            let state = run([open]);
            const first = state.activeKey;
            state = run([newTab], FILE, state);
            const active = state.activeKey;
            state = run([close(first)], FILE, state);
            expect(state.activeKey).toBe(active);
            expect(names(state)).toEqual([
                'Home',
                'Schedule',
                'Schemas',
                'New Tab'
            ]);
        });

        it('does not close main tabs', () => {
            const state = run([]);
            expect(reduceTabs(state, close('home'), FILE)).toBe(state);
        });
    });

    describe('table changed', () => {
        it('renames only the given tab', () => {
            let state = run([open, newTab]);
            const [first, second] = state.tabs.filter(
                (t) => t.kind === 'table'
            );
            state = run([changed(first.key, 7482, 'Team')], FILE, state);
            expect(tabName(state.tabs.find((t) => t.key === first.key)!)).toBe(
                '7482 - Team'
            );
            expect(tabName(state.tabs.find((t) => t.key === second.key)!)).toBe(
                'New Tab'
            );
            expect(keyOf(state, '7482 - Team')).toBe(first.key);
        });

        it('uses only the id for unnamed tables', () => {
            let state = run([open]);
            state = run(
                [changed(state.activeKey, 4096, '\u0000')],
                FILE,
                state
            );
            expect(activeName(state)).toBe('4096');
        });

        it('returns the same state when nothing changes', () => {
            let state = run([open]);
            state = run([changed(state.activeKey, 7482, 'Team')], FILE, state);
            expect(
                reduceTabs(state, changed(state.activeKey, 7482, 'Team'), FILE)
            ).toBe(state);
        });
    });

    describe('history', () => {
        const entry = (tableId: number, row = 0) => ({
            tableId,
            selection: { row, col: 0 }
        });
        const push = (key: string, tableId: number, row = 0) =>
            ({ type: 'historyPush', key, entry: entry(tableId, row) }) as const;
        const go = (key: string, index: number) =>
            ({ type: 'historyGo', key, index }) as const;
        const historyOf = (state: EditorTabsState, key: string) => {
            const tab = state.tabs.find((t) => t.key === key);
            return tab?.kind === 'table' ? tab.history : undefined;
        };

        it('starts and extends a table tab history', () => {
            let state = run([open]);
            const key = state.activeKey;
            expect(historyOf(state, key)).toBeUndefined();
            state = run([push(key, 4096)], FILE, state);
            expect(historyOf(state, key)).toEqual({
                entries: [entry(4096)],
                index: 0
            });
            state = run([push(key, 4097)], FILE, state);
            expect(historyOf(state, key)?.entries).toHaveLength(2);
            expect(historyOf(state, key)?.index).toBe(1);
        });

        it('moves within a table tab history', () => {
            let state = run([open]);
            const key = state.activeKey;
            state = run(
                [push(key, 4096), push(key, 4097), go(key, 0)],
                FILE,
                state
            );
            expect(historyOf(state, key)?.index).toBe(0);
            expect(reduceTabs(state, go(key, 0), FILE)).toBe(state);
        });

        it('keeps each tab its own history', () => {
            let state = run([open, newTab]);
            const [first, second] = state.tabs.filter(
                (t) => t.kind === 'table'
            );
            state = run([push(first.key, 4096)], FILE, state);
            expect(historyOf(state, first.key)).toBeDefined();
            expect(historyOf(state, second.key)).toBeUndefined();
        });

        it('ignores main tabs and unknown keys', () => {
            const state = run([open]);
            expect(reduceTabs(state, push('home', 4096), FILE)).toBe(state);
            expect(reduceTabs(state, push('nope', 4096), FILE)).toBe(state);
            expect(reduceTabs(state, go('home', 0), FILE)).toBe(state);
            expect(reduceTabs(state, go(state.activeKey, 0), FILE)).toBe(state);
        });

        it('opens a table in a new tab without history', () => {
            let state = run([open]);
            state = run(
                [push(state.activeKey, 4096), openTable(7482, 'Team')],
                FILE,
                state
            );
            expect(historyOf(state, keyOf(state, '7482 - Team'))).toBe(
                undefined
            );
        });

        it('drops history with the tabs when the file changes', () => {
            let state = run([open]);
            state = run([push(state.activeKey, 4096)], FILE, state);
            const other = makeFile('file-2');
            state = run([open], other, state);
            expect(
                state.tabs.every(
                    (t) => t.kind !== 'table' || t.history === undefined
                )
            ).toBe(true);
        });
    });
});
