import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import type { CellPosition } from '@renderer/components/TableEditorComponent/TableEditorComponent';
import {
    EditorTab,
    EditorTabsState,
    IN_PLACE_ACTIONS,
    TabAction,
    TabsFile,
    getActiveTab,
    initialTabsState,
    reduceTabs,
    returnsToTab,
    syncFile,
    tabPath
} from './editorTabs';
import { HistoryEntry, HistoryPlace } from './tabHistory';

export interface ScrollPosition {
    top: number;
    left: number;
}

// Where a table tab was left, restored when it is activated again
// (v4's saveTableEditorTabState)
export interface TabViewState {
    // (record, field), in either orientation
    selection?: CellPosition;
    scroll?: ScrollPosition;
    // Switch Orientation, for the tab's current table only
    inverted?: boolean;
}

export interface EditorTabsValue {
    tabs: EditorTab[];
    activeTab: EditorTab;
    // `file` is for a file that was just opened, before the context has it
    openTableEditor: (file?: TabsFile) => void;
    newTab: () => void;
    // `file` as in openTableEditor
    selectTab: (key: string, file?: TabsFile) => void;
    closeTab: (key: string) => void;
    // A table in a new tab, active unless `background`
    openTableTab: (
        tableId: number,
        name: string,
        options?: { selection?: CellPosition; background?: boolean }
    ) => void;
    tableChanged: (key: string, tableId: number, name: string) => void;
    // A table tab's back/forward history (TableTab.history). `from` is where
    // the user was on the entry being left.
    historyPush: (
        key: string,
        entry: HistoryEntry,
        from?: HistoryPlace
    ) => void;
    // The entry moved to, so the caller can load it in the same tick
    historyGo: (
        key: string,
        index: number,
        from?: HistoryPlace
    ) => HistoryEntry | undefined;
    getViewState: (key: string) => TabViewState | undefined;
    setViewState: (key: string, patch: TabViewState) => void;
}

export const EditorTabsContext = createContext<EditorTabsValue | null>(null);

export function useEditorTabs(): EditorTabsValue {
    const value = useContext(EditorTabsContext);
    if (!value) {
        throw new Error('useEditorTabs must be used inside EditorTabsContext');
    }
    return value;
}

// The tab state and commands, for Layout to provide. Commands update the
// tabs, then go to the active tab's page.
export function useEditorTabsController(): EditorTabsValue {
    const [openFile] = useContext(FranchiseFileContext);
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [state, setState] = useState<EditorTabsState>(initialTabsState);

    // Read at call time, so commands are stable and two commands in one
    // tick (setOpenFile, then openTableEditor) see each other's result
    const stateRef = useRef(state);
    const latest = useRef({ openFile, navigate, pathname });
    useLayoutEffect(() => {
        latest.current = { openFile, navigate, pathname };
    });

    // Per-tab view state is in a ref, so selecting cells doesn't re-render
    // the tab bar
    const viewStates = useRef(new Map<string, TabViewState>());
    const fileId = openFile?.fileId;
    const revision = openFile?.revision;
    useEffect(() => {
        viewStates.current.clear();
    }, [fileId, revision]);

    const apply = useCallback((action: TabAction, file?: TabsFile) => {
        const target = file ?? latest.current.openFile;
        const next = reduceTabs(stateRef.current, action, target);
        if (next === stateRef.current) {
            const back = returnsToTab(next, action, latest.current.pathname);
            if (back) latest.current.navigate(back);
            return next;
        }
        stateRef.current = next;
        setState(next);

        for (const key of viewStates.current.keys()) {
            if (!next.tabs.some((tab) => tab.key === key)) {
                viewStates.current.delete(key);
            }
        }

        if (!IN_PLACE_ACTIONS.has(action.type)) {
            const path = tabPath(getActiveTab(next));
            if (path !== latest.current.pathname) {
                latest.current.navigate(path);
            }
        }
        return next;
    }, []);

    const view = useMemo(() => syncFile(state, openFile), [state, openFile]);

    const commands = useMemo(
        () => ({
            openTableEditor: (file?: TabsFile) =>
                apply({ type: 'openTableEditor' }, file),
            newTab: () => apply({ type: 'newTab' }),
            selectTab: (key: string, file?: TabsFile) =>
                apply({ type: 'selectTab', key }, file),
            closeTab: (key: string) => apply({ type: 'closeTab', key }),
            openTableTab: (
                tableId: number,
                name: string,
                {
                    selection,
                    background = false
                }: { selection?: CellPosition; background?: boolean } = {}
            ) => {
                const key = `table-${stateRef.current.nextId}`;
                const next = apply({
                    type: 'openTableTab',
                    tableId,
                    name,
                    background
                });
                // After apply, which drops view states of unknown keys
                if (selection && next.tabs.some((tab) => tab.key === key)) {
                    viewStates.current.set(key, { selection });
                }
            },
            tableChanged: (key: string, tableId: number, name: string) =>
                apply({ type: 'tableChanged', key, tableId, name }),
            historyPush: (
                key: string,
                entry: HistoryEntry,
                from?: HistoryPlace
            ) => {
                apply({ type: 'historyPush', key, entry, from });
            },
            historyGo: (key: string, index: number, from?: HistoryPlace) => {
                const next = apply({ type: 'historyGo', key, index, from });
                const tab = next.tabs.find((t) => t.key === key);
                return tab?.kind === 'table' && tab.history
                    ? tab.history.entries[tab.history.index]
                    : undefined;
            },
            getViewState: (key: string) => viewStates.current.get(key),
            setViewState: (key: string, patch: TabViewState) => {
                viewStates.current.set(key, {
                    ...viewStates.current.get(key),
                    ...patch
                });
            }
        }),
        [apply]
    );

    return useMemo(
        () => ({
            ...commands,
            tabs: view.tabs,
            activeTab: getActiveTab(view)
        }),
        [commands, view]
    );
}
