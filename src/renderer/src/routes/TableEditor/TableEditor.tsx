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
import { CellPosition } from '@renderer/components/TableEditorComponent/TableEditorComponent';

const TableEditor: React.FC = () => {
    const [activeFranchiseFile] = useContext(FranchiseFileContext);
    const [selectedTableId, setSelectedTableId] = useState<number>(-1);
    const [selectedTableData, setSelectedTableData] =
        useState<TableData | null>(null);
    const [filterText, setFilterText] = useState('');
    // Set together with selectedTableData, so the grid only renders once
    const [pendingSelection, setPendingSelection] =
        useState<CellPosition | null>(null);

    const { loader: tableLoader, setOptions: setTableLoaderOptions } =
        useLoader();

    const { pinnedTables, isPinned, togglePin } =
        usePinnedTables(activeFranchiseFile);
    const [showPinnedTables, setShowPinnedTables] = usePreference(
        'tableEditor.showPinnedTables',
        true
    );

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
        selection: CellPosition | null = null
    ): Promise<void> => {
        if (!activeFranchiseFile || table.id === selectedTable?.id) {
            return;
        }

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
        if ('error' in tableResult) {
            console.error(
                `Failed to read table ${table.id}: ${tableResult.error}`
            );
            setSelectedTableId(-1);
            setSelectedTableData(null);
        } else {
            setSelectedTableData(tableResult);
            setPendingSelection(selection);
        }
        setTableLoaderOptions({
            show: false
        });
    };

    // A followed reference link. Stable, so the grid doesn't re-render.
    const onSelectTableRef = useRef(onSelectTable);
    useLayoutEffect(() => {
        onSelectTableRef.current = onSelectTable;
    });
    const onFollowReference = useCallback(
        (tableId: number, recordIndex: number) => {
            const table = allTables?.find((t) => t.id === tableId);
            if (table) {
                void onSelectTableRef.current(table, {
                    row: recordIndex,
                    col: 0
                });
            }
        },
        [allTables]
    );

    // Unlike v4 (TableEditorView), which skips the first table because it is
    // usually unnamed (4096 in M22), this starts on the first table.
    const firstTable = activeFranchiseFile?.tables[0];

    useEffect(() => {
        // Load the first table once the file model is available. This starts an
        // async read and shows the loader, so the synchronous setState is intended.
        if (firstTable) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            void onSelectTable(firstTable);
        }
        // onSelectTable is recreated every render; only rerun when the file changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [firstTable]);

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
                        minSize={200}
                        snap
                    >
                        <TableSidebar
                            onFilter={setFilterText}
                            onTableSelect={onSelectTable}
                            onTogglePinnedVisible={() =>
                                setShowPinnedTables(!showPinnedTables)
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
                                        initialSelection={pendingSelection}
                                        isPinned={isPinned(selectedTable)}
                                        onFollowReference={onFollowReference}
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

            {/* <div className='modal hidden'>
        <div className="modal-header">
          <h2 className="title">Jump to column</h2>
          <div className="close-modal">X</div>
        </div>
        <div className="modal-content">
          <p>Jump to the following column at the following row</p>
          <div className="year-select-wrapper">
            <select name="available-columns" id="available-columns"></select>
            <input type="text" name="row-index" className="jump-row" value="1" />
            <button className="btn btn-go-jump-to-column">Go</button>
          </div>
        </div>
      </div>
      <div id="reference-modal" className="reference-modal modal hidden">
        <div className="modal-header">
          <h2 className="title">References</h2>
          <div className="close-modal">X</div>
        </div>
        <div className="modal-content">
          <div className="reference-header">
            <span>The following tables reference </span>
            <span id="referenced-record-text"></span>
          </div>
          <div id="reference-list-wrapper" className="reference-list-wrapper">

          </div>
        </div>
      </div>
      <div className="spline-editor-wrapper">
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
