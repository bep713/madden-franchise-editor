import { getNavigationItems } from '@data/navigation';
import { FileMetadata, NavigationItem } from '@shared/types';
import { tableTitle } from '@renderer/utils/tableTitle';

// The editor tab bar's state, as in v4's navigationService (tabs, addTab,
// onTableEditorClicked, closeTabAndSelectNextAvailableIfNeeded). Pure, so
// every rule can be tested without React.

export const HOME_KEY = 'home';
// The "Open Table..." main tab, replaced by a table tab when clicked
export const PLACEHOLDER_KEY = 'table-editor';
export const NEW_TAB_NAME = 'New Tab';

export interface MainTab {
    kind: 'main';
    key: string;
    item: NavigationItem;
}

export interface TableTab {
    kind: 'table';
    key: string;
    name: string;
    // Unset until the tab's first table loads
    tableId?: number;
}

export type EditorTab = MainTab | TableTab;

export interface EditorTabsState {
    fileId?: string;
    tabs: EditorTab[];
    activeKey: string;
    // Table tab keys are never reused, so per-tab view state can't leak
    nextId: number;
}

export interface TabsFile {
    fileId: string;
    metadata: FileMetadata;
}

export type TabAction =
    | { type: 'openTableEditor' }
    | { type: 'newTab' }
    | { type: 'selectTab'; key: string }
    | { type: 'closeTab'; key: string }
    | { type: 'tableChanged'; key: string; tableId: number; name: string };

export const initialTabsState: EditorTabsState = syncFile(
    { tabs: [], activeKey: HOME_KEY, nextId: 1 },
    undefined
);

export function tabName(tab: EditorTab): string {
    return tab.kind === 'main' ? tab.item.text : tab.name;
}

export function isImplemented(tab: EditorTab): boolean {
    return tab.kind === 'table' || !!tab.item.implemented;
}

export function getActiveTab(state: EditorTabsState): EditorTab {
    return (
        state.tabs.find((tab) => tab.key === state.activeKey) ?? state.tabs[0]
    );
}

// A fresh tab set whenever the open file changes (v4 rebuilds it on every
// open): the main tabs with "Open Table..." last, and Home active. No file
// means only Home.
export function syncFile(
    state: EditorTabsState,
    file: TabsFile | undefined
): EditorTabsState {
    if (state.tabs.length && state.fileId === file?.fileId) {
        return state;
    }
    return {
        fileId: file?.fileId,
        tabs: getNavigationItems(file?.metadata).map((item): MainTab => ({
            kind: 'main',
            key: item.id,
            item
        })),
        activeKey: HOME_KEY,
        nextId: state.nextId
    };
}

function addNewTab(state: EditorTabsState): EditorTabsState {
    const key = `table-${state.nextId}`;
    return {
        ...state,
        tabs: [...state.tabs, { kind: 'table', key, name: NEW_TAB_NAME }],
        activeKey: key,
        nextId: state.nextId + 1
    };
}

function withoutPlaceholder(state: EditorTabsState): EditorTabsState {
    return {
        ...state,
        tabs: state.tabs.filter((tab) => tab.key !== PLACEHOLDER_KEY)
    };
}

function hasPlaceholder(state: EditorTabsState): boolean {
    return state.tabs.some((tab) => tab.key === PLACEHOLDER_KEY);
}

function openTableEditor(state: EditorTabsState): EditorTabsState {
    if (hasPlaceholder(state)) {
        const next = withoutPlaceholder(state);
        const newTab = next.tabs.find(
            (tab) => tab.kind === 'table' && tab.tableId === undefined
        );
        return newTab ? { ...next, activeKey: newTab.key } : addNewTab(next);
    }

    if (getActiveTab(state).kind === 'table') {
        return state;
    }

    const firstTableTab = state.tabs.find((tab) => tab.kind === 'table');
    return firstTableTab
        ? { ...state, activeKey: firstTableTab.key }
        : addNewTab(state);
}

function closeTab(state: EditorTabsState, key: string): EditorTabsState {
    const index = state.tabs.findIndex((tab) => tab.key === key);
    if (index < 0 || state.tabs[index].kind !== 'table') {
        return state;
    }

    const tabs = state.tabs.filter((tab) => tab.key !== key);
    if (key !== state.activeKey) {
        return { ...state, tabs };
    }

    // The tab to the left, skipping pages React doesn't have yet. Home is
    // always first, so this finds one.
    let nextIndex = index - 1;
    while (nextIndex > 0 && !isImplemented(tabs[nextIndex])) {
        nextIndex--;
    }
    return { ...state, tabs, activeKey: tabs[Math.max(nextIndex, 0)].key };
}

// `file` is the file open when the action runs. If it isn't the one the
// state was built for, the action applies to a fresh tab set.
export function reduceTabs(
    current: EditorTabsState,
    action: TabAction,
    file: TabsFile | undefined
): EditorTabsState {
    const state = syncFile(current, file);

    switch (action.type) {
        case 'openTableEditor':
            return file ? openTableEditor(state) : state;
        case 'newTab':
            return file ? addNewTab(withoutPlaceholder(state)) : state;
        case 'selectTab': {
            const tab = state.tabs.find((t) => t.key === action.key);
            if (!tab || tab.key === state.activeKey || !isImplemented(tab)) {
                return state;
            }
            if (tab.key === PLACEHOLDER_KEY) {
                return openTableEditor(state);
            }
            return { ...state, activeKey: tab.key };
        }
        case 'closeTab':
            return closeTab(state, action.key);
        case 'tableChanged': {
            const name = tableTitle(action.tableId, action.name);
            const tab = state.tabs.find((t) => t.key === action.key);
            if (
                tab?.kind !== 'table' ||
                (tab.tableId === action.tableId && tab.name === name)
            ) {
                return state;
            }
            return {
                ...state,
                tabs: state.tabs.map((t) =>
                    t === tab ? { ...tab, tableId: action.tableId, name } : t
                )
            };
        }
    }
}
