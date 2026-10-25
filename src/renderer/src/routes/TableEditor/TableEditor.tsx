import { useContext, useEffect, useMemo, useState } from 'react';

import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

import Fuse from 'fuse.js';

import styles from './TableEditor.module.scss';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { TableData, TableListItem, TableType } from '@shared/types';
import TableSidebar from './components/TableSidebar/TableSidebar';
import useLoader from '@renderer/hooks/useLoader';
import ExpressionEditorView from './views/ExpressionEditorView';
import FieldEditorView from './views/FieldEditorView';

const TableEditor: React.FC = () => {
    const [activeFranchiseFile] = useContext(FranchiseFileContext);
    const [selectedTableId, setSelectedTableId] = useState<number>(-1);
    const [selectedTableData, setSelectedTableData] =
        useState<TableData | null>(null);
    const [filterText, setFilterText] = useState('');

    const { loader: tableLoader, setOptions: setTableLoaderOptions } =
        useLoader();

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

    const onSelectTable = async (table: TableListItem): Promise<void> => {
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
        }
        setTableLoaderOptions({
            show: false
        });
    };

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
                            selectedTableId={selectedTableId}
                            tables={filteredTables}
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
                                        setTableLoaderOptions={
                                            setTableLoaderOptions
                                        }
                                        table={selectedTableData}
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
      <div id="blob-editor-modal" className="blob-editor-modal modal hidden">
        <div className="modal-header">
          <h2 className="title">Edit Blob Data</h2>
          <div className="close-modal">Apply Changes</div>
        </div>
        <div className="modal-content">
          <div id="blob-editor"></div>
        </div>
      </div>
      <div className="blob-editor-underlay underlay-editor hidden"></div>
      <div id="reference-editor-wrapper" className="reference-editor-wrapper hidden">
        <div className="reference-editor-underlay underlay-editor"></div>
        <div id="reference-editor-highlight" className="reference-editor-highlight"></div>
        <div id="reference-editor-content" className="reference-editor-content">
          <div className="reference-title-wrapper">
            Edit cell reference
            <button className="close">X</button>
          </div>
          <div className="reference-values-wrapper">
            <div className="table-reference filter">
              <label htmlFor="reference-editor-table">Table</label>
              <select id="reference-editor-table" className="filter-input"></select>
            </div>
            <div className="row-reference filter">
              <label htmlFor="reference-editor-row">Row Index</label>
              <input type="number" min="0" id="reference-editor-row" className="filter-input" />
            </div>
            <div className="row-reference filter">
              <label htmlFor="reference-editor-row">Binary</label>
              <input type="text" id="reference-editor-binary" maxLength={32} className="filter-input" />
            </div>
            <button id="btn-change-reference" className="form-button form-button--no-bg-color">Change</button>
          </div>
        </div>
      </div>
      <div className="underlay hidden"></div>
      <div className="loader-wrapper hidden">
        <div className="loader"></div>
      </div> */}
        </div>
    );
};

export default TableEditor;
