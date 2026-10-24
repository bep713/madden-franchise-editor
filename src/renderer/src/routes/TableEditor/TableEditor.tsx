import { useContext, useEffect, useState } from 'react';

import { Allotment } from 'allotment';
import 'allotment/dist/style.css';

import Fuse from 'fuse.js';

import styles from './TableEditor.module.scss';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import {
    FranchiseBaseTableModel,
    FranchiseTableModel,
    TableType
} from '@shared/types';
import TableSidebar from './components/TableSidebar/TableSidebar';
import useLoader from '@renderer/hooks/useLoader';
import ExpressionEditorView from './views/ExpressionEditorView';
import FieldEditorView from './views/FieldEditorView';

const TableEditor: React.FC = () => {
    const [activeFranchiseFile] = useContext(FranchiseFileContext);
    const [selectedTableId, setSelectedTableId] = useState<number>(-1);
    const [selectedTableData, setSelectedTableData] =
        useState<FranchiseTableModel | null>(null);
    const [filteredTables, setFilteredTables] = useState<
        FranchiseBaseTableModel[] | undefined
    >(activeFranchiseFile?.tables);

    const { loader: tableLoader, setOptions: setTableLoaderOptions } =
        useLoader();

    const selectedTable = activeFranchiseFile?.tables?.find(
        (table) => table.id === selectedTableId
    );

    const isExpressionTable = selectedTable?.type === TableType.SPEX;

    const fuse = new Fuse(activeFranchiseFile?.tables || [], {
        keys: ['index', 'name', 'id'],
        includeScore: true
    });

    const onFilterTable = (filterText: string): void => {
        const rawResult = fuse.search(filterText);
        setFilteredTables(
            filterText.length > 0
                ? rawResult.map((result) => result.item)
                : activeFranchiseFile?.tables?.sort((a, b) => a.index - b.index)
        );
    };

    const onSelectTable = async (
        table: FranchiseBaseTableModel
    ): Promise<void> => {
        if (
            !activeFranchiseFile ||
            table.uniqueId === selectedTable?.uniqueId
        ) {
            return;
        }

        setTableLoaderOptions({
            message: 'Loading table...',
            show: true
        });
        setSelectedTableId(table.id);
        const tableResult = await window.api.franchise.readTableData({
            franchiseId: activeFranchiseFile.franchiseId,
            tables: [{ tableUniqueId: table.uniqueId }]
        });
        setSelectedTableData(tableResult?.tables?.[0]);
        setTableLoaderOptions({
            show: false
        });
    };

    const firstTable = activeFranchiseFile?.tables?.[0];

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
                            onFilter={onFilterTable}
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
                                        franchiseId={
                                            activeFranchiseFile.franchiseId
                                        }
                                        key={selectedTable.uniqueId}
                                        setTableLoaderOptions={
                                            setTableLoaderOptions
                                        }
                                        table={selectedTableData}
                                    />
                                ) : (
                                    <FieldEditorView
                                        franchiseId={
                                            activeFranchiseFile.franchiseId
                                        }
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
