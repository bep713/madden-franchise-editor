import {
    useCallback,
    useContext,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState
} from 'react';

import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

import Fuse from 'fuse.js';

import styles from './TableEditor.module.scss';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { TableData, TableListItem, TableType } from '@shared/types';
import TableSidebar from './components/TableSidebar/TableSidebar';
import { buildSidebarRows } from './components/TableSidebar/sidebarRows';
import usePinnedTables from '@renderer/hooks/usePinnedTables';
import usePreference from '@renderer/hooks/usePreference';
import useLoader from '@renderer/hooks/useLoader';
import ExpressionEditorView from './views/ExpressionEditorView';
import FieldEditorView from './views/FieldEditorView';
import {
    CellPosition,
    GridHandle,
    GridScroll
} from '@renderer/components/TableEditorComponent/TableEditorComponent';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import { HistoryPlace, TabHistory } from '@renderer/tabs/tabHistory';
import HistoryButtons from './components/HistoryButtons/HistoryButtons';
import { OpenMode } from '@renderer/utils/openMode';
import useTableDataCommands from './useTableDataCommands';

interface LoadOptions {
    // Reload even if the table is already shown (a tab switch)
    force?: boolean;
    scroll?: GridScroll;
    // Restored for a tab switch and an import reload; any other load of a
    // table starts in the normal view
    inverted?: boolean;
    // 'push' adds a history entry once the table has loaded; 'none' is for
    // moves within history, tab switches and reloads
    history?: 'push' | 'none';
    // The cell the user left from (a clicked reference), when the view
    // state may not have it yet
    from?: CellPosition | null;
}

// Where the user is on a tab, saved into the history entry being left
function placeOf(
    saved: { selection?: CellPosition; scroll?: GridScroll } | undefined,
    selection?: CellPosition | null
): HistoryPlace | undefined {
    const at = selection ?? saved?.selection;
    return at && { selection: at, scroll: saved?.scroll };
}

// Ignored while a modal is open or a cell is being edited (as Ctrl+J)
function blocksHistoryKeys(target: EventTarget | null): boolean {
    return (
        !!document.querySelector('[role="dialog"]') ||
        !!(target as HTMLElement | null)?.closest?.('.handsontableInput')
    );
}

const TableEditor: React.FC = () => {
    const [activeFranchiseFile] = useContext(FranchiseFileContext);
    const [selectedTableId, setSelectedTableId] = useState<number>(-1);
    const [selectedTableData, setSelectedTableData] =
        useState<TableData | null>(null);
    const [filterText, setFilterText] = useState('');
    // Set together with selectedTableData, so the grid only renders once
    const [pendingSelection, setPendingSelection] =
        useState<CellPosition | null>(null);
    const [pendingScroll, setPendingScroll] = useState<GridScroll | null>(null);
    const [isInverted, setIsInverted] = useState(false);

    const {
        activeTab,
        getViewState,
        historyGo,
        historyPush,
        openTableEditor,
        openTableTab,
        setViewState,
        tableChanged
    } = useEditorTabs();
    // The tab a load or a grid event belongs to, read at event time
    const activeKeyRef = useRef(activeTab.key);
    const history = activeTab.kind === 'table' ? activeTab.history : undefined;
    const historyRef = useRef<TabHistory | undefined>(history);
    const shownTableIdRef = useRef(selectedTableId);
    useLayoutEffect(() => {
        activeKeyRef.current = activeTab.key;
        historyRef.current = history;
        shownTableIdRef.current = selectedTableId;
    });
    // The field editor's grid, for a Back/Forward within one table
    const gridRef = useRef<GridHandle>(null);
    // Only the latest load is shown, when tabs are switched quickly
    const loadIdRef = useRef(0);

    const { loader: tableLoader, setOptions: setTableLoaderOptions } =
        useLoader();

    const { pinnedTables, isPinned, togglePin } =
        usePinnedTables(activeFranchiseFile);
    // A settings checkbox, so it is stored as [true] (on) or [] (off)
    const [showPinnedTablesValue, setShowPinnedTablesValue] = usePreference<
        unknown[]
    >('general.showPinnedTables', [true]);
    const showPinnedTables = showPinnedTablesValue.length > 0;

    const selectedTable = activeFranchiseFile?.tables.find(
        (table) => table.id === selectedTableId
    );

    const isExpressionTable = selectedTable?.type === TableType.SPEX;

    const allTables = activeFranchiseFile?.tables;

    // Derived, not seeded into state, so it updates when the model arrives async.
    const filteredTables = useMemo(() => {
        if (!allTables) {
            return undefined;
        }

        if (filterText.length === 0) {
            return [...allTables].sort((a, b) => a.index - b.index);
        }

        const fuse = new Fuse(allTables, {
            keys: ['index', 'name', 'id'],
            includeScore: true
        });
        return fuse.search(filterText).map((result) => result.item);
    }, [allTables, filterText]);

    const sidebarRows = useMemo(
        () =>
            filteredTables &&
            buildSidebarRows(
                filteredTables,
                pinnedTables,
                isPinned,
                showPinnedTables
            ),
        [filteredTables, pinnedTables, isPinned, showPinnedTables]
    );

    const tableNames = useMemo(
        () => new Map((allTables ?? []).map((table) => [table.id, table.name])),
        [allTables]
    );

    const onSelectTable = async (
        table: TableListItem,
        selection: CellPosition | null = null,
        options: LoadOptions = {}
    ): Promise<void> => {
        if (
            !activeFranchiseFile ||
            (!options.force && table.id === selectedTable?.id)
        ) {
            return;
        }
        const tabKey = activeKeyRef.current;
        const loadId = ++loadIdRef.current;
        // Before the load, which overwrites the view state
        const from = placeOf(getViewState(tabKey), options.from);

        setTableLoaderOptions({
            message: 'Loading table...',
            show: true
        });
        setSelectedTableId(table.id);
        // A tableId is stable within one open file
        const tableResult = await window.franchiseAPI.readTableData(
            activeFranchiseFile.fileId,
            table.id
        );
        if (loadId !== loadIdRef.current) {
            // A later load replaced this one, and hides the loader
            return;
        }
        if ('error' in tableResult) {
            console.error(
                `Failed to read table ${table.id}: ${tableResult.error}`
            );
            setSelectedTableId(-1);
            setSelectedTableData(null);
        } else {
            setSelectedTableData(tableResult);
            setPendingSelection(selection);
            setPendingScroll(options.scroll ?? null);
            setIsInverted(!!options.inverted);
            setViewState(tabKey, {
                selection: selection ?? { row: 0, col: 0 },
                scroll: options.scroll,
                inverted: !!options.inverted
            });
            tableChanged(tabKey, table.id, table.name);
            if (options.history !== 'none') {
                historyPush(
                    tabKey,
                    {
                        tableId: table.id,
                        selection: selection ?? { row: 0, col: 0 },
                        scroll: options.scroll
                    },
                    from
                );
            }
        }
        setTableLoaderOptions({
            show: false
        });
    };

    // Back, Forward or a history menu item. The index moves at once, so two
    // quick Backs go back two steps; a superseded load isn't shown.
    const goToHistory = (index: number): void => {
        const tabKey = activeKeyRef.current;
        const entry = historyGo(tabKey, index, placeOf(getViewState(tabKey)));
        const table = allTables?.find((t) => t.id === entry?.tableId);
        if (!entry || !table) {
            return;
        }
        if (
            entry.tableId === selectedTableId &&
            selectedTableData?.tableId === entry.tableId
        ) {
            // Already shown: drop any load in flight and select the cell
            loadIdRef.current++;
            setTableLoaderOptions({ show: false });
            const { row, col } = entry.selection;
            gridRef.current?.selectCell(row, col);
            setViewState(tabKey, { selection: entry.selection });
            return;
        }
        void onSelectTable(table, entry.selection, {
            force: true,
            scroll: entry.scroll,
            history: 'none'
        });
    };

    // Stable, so the grid and sidebar don't re-render
    const onSelectTableRef = useRef(onSelectTable);
    const goToHistoryRef = useRef(goToHistory);
    useLayoutEffect(() => {
        onSelectTableRef.current = onSelectTable;
        goToHistoryRef.current = goToHistory;
    });
    const onGoHistory = useCallback(
        (index: number) => goToHistoryRef.current(index),
        []
    );

    // Alt+Left/Right and the mouse's back/forward buttons
    useEffect(() => {
        const step = (delta: number): void => {
            const h = historyRef.current;
            const index = (h?.index ?? 0) + delta;
            if (h && index >= 0 && index < h.entries.length) {
                goToHistoryRef.current(index);
            }
        };
        const onKeyDown = (e: KeyboardEvent): void => {
            if (
                !e.altKey ||
                e.ctrlKey ||
                e.metaKey ||
                e.shiftKey ||
                (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') ||
                blocksHistoryKeys(e.target)
            ) {
                return;
            }
            e.preventDefault();
            step(e.key === 'ArrowLeft' ? -1 : 1);
        };
        const onMouseUp = (e: MouseEvent): void => {
            if (e.button !== 3 && e.button !== 4) {
                return;
            }
            // Always, or Chromium also goes back in the HashRouter's history
            e.preventDefault();
            if (!blocksHistoryKeys(null)) {
                step(e.button === 3 ? -1 : 1);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        document.addEventListener('mouseup', onMouseUp);
        return () => {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, []);

    // A ctrl/middle-clicked table opens in a new tab, which loads it when
    // activated (the activeTab.key effect below)
    const onSidebarSelect = useCallback(
        (table: TableListItem, mode: OpenMode) => {
            if (mode === 'current') {
                void onSelectTableRef.current(table);
            } else {
                openTableTab(table.id, table.name, {
                    background: mode === 'background'
                });
            }
        },
        [openTableTab]
    );

    // A followed reference link, or a References modal row (with its field)
    const onFollowReference = useCallback(
        (
            tableId: number,
            recordIndex: number,
            mode: OpenMode,
            from: CellPosition | null,
            fieldIndex = 0
        ) => {
            const table = allTables?.find((t) => t.id === tableId);
            if (!table) {
                return;
            }
            const selection = { row: recordIndex, col: fieldIndex };
            if (mode === 'current') {
                void onSelectTableRef.current(table, selection, { from });
            } else {
                openTableTab(table.id, table.name, {
                    selection,
                    background: mode === 'background'
                });
            }
        },
        [allTables, openTableTab]
    );

    // A jump to column or a self-reference: a history entry in this table
    const onNavigateInTable = useCallback(
        (to: CellPosition, from: CellPosition | null) => {
            const tabKey = activeKeyRef.current;
            historyPush(
                tabKey,
                { tableId: shownTableIdRef.current, selection: to },
                placeOf(getViewState(tabKey), from)
            );
        },
        [getViewState, historyPush]
    );

    // Where the grid is, saved to the active tab. Stable, so the grid
    // doesn't re-render.
    const onSelectionChange = useCallback(
        (selection: CellPosition) =>
            setViewState(activeKeyRef.current, { selection }),
        [setViewState]
    );
    const onScroll = useCallback(
        (scroll: GridScroll) => setViewState(activeKeyRef.current, { scroll }),
        [setViewState]
    );
    const onToggleOrientation = (): void => {
        setIsInverted(!isInverted);
        setViewState(activeKeyRef.current, { inverted: !isInverted });
    };

    const fileId = activeFranchiseFile?.fileId;

    // Built when a command starts. The reload after an import is skipped if
    // the user has switched tabs since; that tab reloads when activated.
    const runTableCommand = useTableDataCommands(() => {
        if (!fileId || !selectedTable || !selectedTableData) {
            return null;
        }
        const tabKey = activeKeyRef.current;
        const table = selectedTable;
        return {
            fileId,
            table: selectedTableData,
            isExpressionTable,
            setLoaderOptions: setTableLoaderOptions,
            reloadTable: async () => {
                if (activeKeyRef.current !== tabKey) {
                    return;
                }
                // Back on the same cell, scroll position and orientation
                const saved = getViewState(tabKey);
                await onSelectTableRef.current(
                    table,
                    saved?.selection ?? null,
                    {
                        force: true,
                        scroll: saved?.scroll,
                        inverted: saved?.inverted,
                        history: 'none'
                    }
                );
            }
        };
    });
    const onExport = useCallback(
        () => void runTableCommand('export'),
        [runTableCommand]
    );
    const onImport = useCallback(
        () => void runTableCommand('import'),
        [runTableCommand]
    );

    const activeTableId =
        activeTab.kind === 'table' ? activeTab.tableId : undefined;

    useEffect(() => {
        if (!activeFranchiseFile) {
            return;
        }
        // Reached without a table tab (a renderer reload on this page)
        if (activeTab.kind !== 'table') {
            openTableEditor();
            return;
        }

        // A tab shows the table it was left on, where it was left. A new tab
        // opens the first table. Unlike v4 (TableEditorView), which skips the
        // first table because it is usually unnamed (4096 in M22), this
        // starts on the first table.
        const tabTable = activeFranchiseFile.tables.find(
            (table) => table.id === activeTableId
        );
        const firstTable = activeFranchiseFile.tables[0];
        // This starts an async read and shows the loader, so the synchronous
        // setState is intended.
        if (tabTable) {
            const saved = getViewState(activeTab.key);
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void onSelectTable(tabTable, saved?.selection ?? null, {
                force: true,
                scroll: saved?.scroll,
                inverted: saved?.inverted,
                // A tab's first load starts its history
                history: activeTab.history ? 'none' : 'push'
            });
        } else if (firstTable) {
            void onSelectTable(firstTable, null, { force: true });
        }
        // Only on a tab switch or a new file. The tab's tableId changes on
        // every load in it, which must not reload.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab.key, fileId]);

    if (!activeFranchiseFile) {
        return null;
    }

    return (
        <div className={styles.tableEditorWrapper}>
            <div className={styles.tableWrapper}>
                <Allotment
                    className={styles.tableMainWrapper}
                    defaultSizes={[1, 4]}
                >
                    <Allotment.Pane
                        className={styles.tableListWrapper}
                        minSize={240}
                        snap
                    >
                        <TableSidebar
                            headerStart={
                                <HistoryButtons
                                    history={history}
                                    onGo={onGoHistory}
                                    tableNames={tableNames}
                                />
                            }
                            onFilter={setFilterText}
                            onTableSelect={onSidebarSelect}
                            onTogglePinnedVisible={() =>
                                setShowPinnedTablesValue(
                                    showPinnedTables ? [] : [true]
                                )
                            }
                            onTogglePin={togglePin}
                            rows={sidebarRows}
                            selectedTableId={selectedTableId}
                            showPinnedTables={showPinnedTables}
                        />
                    </Allotment.Pane>
                    <Allotment.Pane>
                        <div className={styles.tableContentWrapper}>
                            {tableLoader}
                            {selectedTable &&
                                selectedTableData &&
                                (isExpressionTable ? (
                                    <ExpressionEditorView
                                        key={selectedTable.id}
                                        setTableLoaderOptions={
                                            setTableLoaderOptions
                                        }
                                        table={selectedTableData}
                                    />
                                ) : (
                                    <FieldEditorView
                                        fileId={activeFranchiseFile.fileId}
                                        gridRef={gridRef}
                                        initialScroll={pendingScroll}
                                        initialSelection={pendingSelection}
                                        isInverted={isInverted}
                                        isPinned={isPinned(selectedTable)}
                                        onFollowReference={onFollowReference}
                                        onNavigateInTable={onNavigateInTable}
                                        onExport={onExport}
                                        onImport={onImport}
                                        onScroll={onScroll}
                                        onSelectionChange={onSelectionChange}
                                        onToggleOrientation={
                                            onToggleOrientation
                                        }
                                        onTogglePin={() =>
                                            togglePin(selectedTable)
                                        }
                                        setTableLoaderOptions={
                                            setTableLoaderOptions
                                        }
                                        table={selectedTableData}
                                        tableNames={tableNames}
                                        tables={allTables ?? []}
                                    />
                                ))}
                        </div>
                    </Allotment.Pane>
                </Allotment>
            </div>

            {/* <div className="spline-editor-wrapper">
        <div id="spline-editor-area"></div>
      </div>
      <div className="underlay hidden"></div>
      <div className="loader-wrapper hidden">
        <div className="loader"></div>
      </div> */}
        </div>
    );
};

export default TableEditor;
