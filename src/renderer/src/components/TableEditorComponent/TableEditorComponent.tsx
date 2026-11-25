import React, {
    forwardRef,
    useCallback,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef
} from 'react';

import cx from 'classnames';
import type Handsontable from 'handsontable';
import { HotTable, HotTableRef } from '@handsontable/react-wrapper';
import 'handsontable/styles/handsontable.min.css';
import 'handsontable/styles/ht-theme-main.min.css';
import { registerAllModules } from 'handsontable/registry';
import { TableColumn, TableData } from '@shared/types';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import { WriteState } from '@renderer/utils/cellWrites';
import { OpenMode, getOpenMode } from '@renderer/utils/openMode';
import { resolveReference } from '@renderer/utils/references';

import {
    buildColumns,
    calculateColumnWidths,
    calculateInvertedColumnWidths
} from './columns';
import { getCellMeta } from './cellMeta';
import {
    buildContextMenu,
    canEmptyRecords,
    ContextMenuActions,
    recordsToEmpty,
    singleSelectedRecord
} from './contextMenu';
import {
    createOrientation,
    GridOrientation,
    RecordCell,
    toSelectionCell
} from './orientation';
import { createReferenceRenderer } from './renderers/referenceRenderer';
import { blobRenderer } from './renderers/blobRenderer';
import useCellWrites, {
    CellWriteContext,
    createWriteState
} from './useCellWrites';
import useEmptyRecords from './useEmptyRecords';
import useUndoStack, { EmptyHandler } from './useUndoStack';
import styles from './TableEditorComponent.module.css';

registerAllModules();

// A table that is only displayed (e.g. the expression editor's output)
interface ReadOnlyTable {
    headers: Pick<TableColumn, 'name'>[];
    records: TableData['records'];
}

// A cell outside the grid: row is the record index and col the field index,
// in either orientation. Only TableEditorComponent knows visual cells.
export interface CellPosition {
    row: number;
    col: number;
}

const toPosition = (cell: RecordCell): CellPosition => ({
    row: cell.recordIndex,
    col: cell.fieldIndex
});
const toRecordCell = (position: CellPosition): RecordCell => ({
    recordIndex: position.row,
    fieldIndex: position.col
});

export interface GridScroll {
    top: number;
    left: number;
}

export interface ReferenceEditRequest extends CellPosition {
    value: string;
    anchorRect: DOMRect;
}

export interface BlobEditRequest extends CellPosition {
    value: unknown;
}

// What the reference and blob editors use to write back. Writes go through
// setDataAtCell, so they take the normal write path and can be undone.
export interface GridHandle {
    setDataAtCell: (row: number, col: number, value: unknown) => void;
    selectCell: (row: number, col: number) => void;
    // The selected cell, or the last one before a click outside the grid
    // deselected it. null after a header selection.
    getSelectedCell: () => CellPosition | null;
    // Also stops the grid listening to keys, until the next selectCell
    deselectCell: () => void;
}

interface Props {
    isInverted?: boolean;
    // Compact table editor spacing: v4-like cell padding and row height
    compact?: boolean;
    table: TableData | ReadOnlyTable;
    // Editing is enabled when fileId is set and table is a TableData
    fileId?: string;
    tableNames?: ReadonlyMap<number, string>;
    setLoaderOptions?: LoaderOptionsSetter;
    // Selected after each table load, (0, 0) when unset
    initialSelection?: CellPosition | null;
    // Scrolled to after each table load, after initialSelection
    initialScroll?: GridScroll | null;
    // The last selected cell and the viewport's scroll position. Must be
    // stable, like every other prop.
    onSelectionChange?: (selection: CellPosition) => void;
    onScroll?: (scroll: GridScroll) => void;
    // `from` is the clicked cell, null when it isn't known
    onFollowReference?: (
        tableId: number,
        recordIndex: number,
        mode: OpenMode,
        from: CellPosition | null
    ) => void;
    onEditReference?: (request: ReferenceEditRequest) => void;
    onEditBlob?: (request: BlobEditRequest) => void;
    // Find references to this record... in the context menu
    onFindReferences?: (recordIndex: number) => void;
}

const THEME_NAME = 'ht-theme-main-dark-auto';
// A theme with no stylesheet, used to make Handsontable re-read the theme's
// CSS variables (see the compact effect)
const RELOAD_THEME_NAME = 'ht-theme-reload';

// The element that scrolls the grid's viewport
function getScrollHolder(hotRef: React.RefObject<HotTableRef>) {
    return hotRef.current?.hotInstance?.rootElement.querySelector<HTMLElement>(
        '.ht_master .wtHolder'
    );
}

// Scrolls a visual cell to the top of the grid
function revealCell(
    hot: Handsontable,
    { row, col }: { row: number; col: number }
) {
    hot.scrollViewportTo({ row, col, verticalSnap: 'top' });
}

// The clicked link or button, and its cell
function getActionTarget(
    event: React.MouseEvent,
    hot: Handsontable | null | undefined
) {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-action]'
    );
    const td = target?.closest('td');
    if (!target || !td || !hot) {
        return null;
    }

    const { row, col } = hot.getCoords(td) ?? {};
    if (row === undefined || col === undefined || row < 0 || col < 0) {
        return null;
    }
    return { target, td, hot, row, col };
}

// The reference link under a click that opens a new tab
function getNewTabReference(
    event: React.MouseEvent,
    hot: Handsontable | null | undefined
): HTMLElement | null {
    if (getOpenMode(event) === 'current') {
        return null;
    }
    const target = getActionTarget(event, hot)?.target;
    return target?.dataset.action === 'follow-reference' ? target : null;
}

const NO_TABLE_NAMES: ReadonlyMap<number, string> = new Map();

function isEditableTable(table: Props['table']): table is TableData {
    return 'tableId' in table;
}

// React.memo matters here: the react-wrapper passes every prop to
// updateSettings on each render, and Handsontable updates `data` whenever it
// is passed, which drops the selection. So every prop has to be stable, and
// the hooks read the latest props from propsRef. Undo is our own stack
// (useUndoStack), in record terms, so a data update doesn't affect it.
const TableEditorComponent = forwardRef<GridHandle, Props>(
    function TableEditorComponent(props, ref) {
        const { compact, isInverted, table } = props;
        const hotRef = useRef<HotTableRef>(null);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const propsRef = useRef(props);
        // Kept through a deselect, for getSelectedCell
        const lastSelectionRef = useRef<CellPosition | null>(null);
        const writeStateRef = useRef<WriteState>(
            isEditableTable(table)
                ? createWriteState(table)
                : createWriteState({
                      cellErrors: {},
                      emptyRecordIndices: []
                  } as unknown as TableData)
        );

        useLayoutEffect(() => {
            propsRef.current = props;
        });

        const editable = !!props.fileId && isEditableTable(table);

        const headerNames = useMemo(
            () => table.headers.map((header) => header.name),
            [table]
        );

        // Visual cells ↔ (record, field). The hooks read it from the ref, so
        // they stay stable.
        const orientation = useMemo(
            () =>
                createOrientation(!!isInverted, headerNames, {
                    toPhysicalRow: (row) =>
                        hotRef.current?.hotInstance?.toPhysicalRow(row) ?? row,
                    toVisualRow: (row) =>
                        hotRef.current?.hotInstance?.toVisualRow(row) ?? row
                }),
            [headerNames, isInverted]
        );
        const orientationRef = useRef<GridOrientation>(orientation);
        useLayoutEffect(() => {
            orientationRef.current = orientation;
        }, [orientation]);

        // Set below, once useEmptyRecords exists (it needs undo)
        const emptyHandlerRef = useRef<EmptyHandler | null>(null);
        const undo = useUndoStack(hotRef, orientationRef, emptyHandlerRef);

        useLayoutEffect(() => {
            if (isEditableTable(table)) {
                writeStateRef.current = createWriteState(table);
            }
        }, [table]);

        // The visual cell a new grid scrolls to once it has a height
        const revealPendingRef = useRef<{ row: number; col: number } | null>(
            null
        );

        useEffect(() => {
            // Handle window resizing so that the table always takes up the entire remaining space.
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentBoxSize) {
                        const size = entry.contentBoxSize[0];
                        const hot = hotRef?.current?.hotInstance;
                        hot?.updateSettings({
                            height: size.blockSize,
                            width: size.inlineSize
                        });
                        const target = revealPendingRef.current;
                        if (hot && target && size.blockSize > 0) {
                            revealPendingRef.current = null;
                            revealCell(hot, target);
                        }
                    }
                }
            });

            if (wrapperRef.current) {
                observer.observe(wrapperRef.current);
            }

            return () => observer.disconnect();
        }, []);

        // The grid exists once HotTable's own mount effect has run
        useEffect(() => undo.registerShortcuts(), [undo]);

        useImperativeHandle(
            ref,
            () => ({
                setDataAtCell: (row, col, value) => {
                    const [visualRow, visualCol] =
                        orientationRef.current.toVisualCell(
                            toRecordCell({ row, col })
                        );
                    hotRef.current?.hotInstance?.setDataAtCell(
                        visualRow,
                        visualCol,
                        value
                    );
                },
                selectCell: (row, col) =>
                    hotRef.current?.hotInstance?.selectCell(
                        ...orientationRef.current.toVisualCell(
                            toRecordCell({ row, col })
                        )
                    ),
                getSelectedCell: () => lastSelectionRef.current,
                deselectCell: () => {
                    const hot = hotRef.current?.hotInstance;
                    hot?.deselectCell();
                    hot?.unlisten();
                }
            }),
            []
        );

        const getWriteContext = useCallback((): CellWriteContext | null => {
            const { fileId, setLoaderOptions } = propsRef.current;
            const current = propsRef.current.table;
            if (!fileId || !setLoaderOptions || !isEditableTable(current)) {
                return null;
            }
            return { fileId, table: current, setLoaderOptions };
        }, []);

        const { beforeChange, afterChange } = useCellWrites(
            hotRef,
            getWriteContext,
            writeStateRef,
            orientationRef,
            undo
        );

        const emptyRecords = useEmptyRecords(
            hotRef,
            getWriteContext,
            writeStateRef,
            orientationRef,
            undo
        );
        useLayoutEffect(() => {
            emptyHandlerRef.current = (indices) =>
                emptyRecords.setRecordsEmpty(indices, { record: false });
        }, [emptyRecords]);

        // v4's contextMenuService. Everything is read at call time, so the
        // settings never change between renders. Only the last selection
        // layer counts.
        const contextMenu = useMemo(() => {
            if (!editable) {
                return false;
            }
            const getSelection = () =>
                hotRef.current?.hotInstance?.getSelectedLast();
            const getSingleRecord = () =>
                singleSelectedRecord(getSelection(), orientationRef.current);

            // The one selected cell, if it holds a resolvable reference
            const getSelectedReference = () => {
                const hot = hotRef.current?.hotInstance;
                const range = getSelection();
                const current = propsRef.current.table;
                if (!hot || !range || !isEditableTable(current)) {
                    return null;
                }
                const [row1, col1, row2, col2] = range;
                if (row1 !== row2 || col1 !== col2) {
                    return null;
                }
                const cell = orientationRef.current.toRecordCell(row1, col1);
                const header = cell && current.headers[cell.fieldIndex];
                if (!cell || !header?.isReference) {
                    return null;
                }
                const resolved = resolveReference(
                    hot.getDataAtCell(row1, col1),
                    propsRef.current.tableNames ?? NO_TABLE_NAMES
                );
                return resolved && { resolved, cell };
            };

            const getRecordsToEmpty = () => {
                const current = propsRef.current.table;
                if (!isEditableTable(current) || !canEmptyRecords(current)) {
                    return [];
                }
                return recordsToEmpty(
                    getSelection(),
                    orientationRef.current,
                    writeStateRef.current.emptyRecordIndices
                );
            };

            const actions: ContextMenuActions = {
                findReferences: {
                    disabled: () => getSingleRecord() === null,
                    run: () => {
                        const record = getSingleRecord();
                        if (record !== null) {
                            propsRef.current.onFindReferences?.(record);
                        }
                    }
                },
                openReferenceInNewTab: {
                    disabled: () => !getSelectedReference(),
                    run: () => {
                        const reference = getSelectedReference();
                        if (reference) {
                            propsRef.current.onFollowReference?.(
                                reference.resolved.tableId,
                                reference.resolved.recordIndex,
                                'background',
                                toPosition(reference.cell)
                            );
                        }
                    }
                },
                setRecordsEmpty: {
                    disabled: () => getRecordsToEmpty().length === 0,
                    run: () => {
                        const indices = getRecordsToEmpty();
                        if (indices.length) {
                            void emptyRecords.setRecordsEmpty(indices);
                        }
                    }
                },
                setNextRecordToUse: {
                    disabled: () => {
                        const record = getSingleRecord();
                        return (
                            record === null ||
                            !writeStateRef.current.emptyRecordIndices.has(
                                record
                            )
                        );
                    },
                    run: () => {
                        const record = getSingleRecord();
                        if (record !== null) {
                            void emptyRecords.setNextRecordToUse(record);
                        }
                    }
                }
            };
            return buildContextMenu(actions);
        }, [editable, emptyRecords]);

        const referenceRenderer = useMemo(
            () =>
                createReferenceRenderer(
                    () => propsRef.current.tableNames ?? NO_TABLE_NAMES
                ),
            []
        );

        // Per field. Column settings in the normal view; inverted, where the
        // grid's rows are arrays, cells() returns them per cell.
        const fieldColumns = useMemo(
            () =>
                editable
                    ? buildColumns((table as TableData).headers, {
                          reference: referenceRenderer,
                          blob: blobRenderer
                      })
                    : [],
            [editable, referenceRenderer, table]
        );

        const columns = useMemo(
            () =>
                isInverted
                    ? undefined
                    : editable
                      ? fieldColumns
                      : headerNames.map((name) => ({ data: name })),
            [editable, fieldColumns, headerNames, isInverted]
        );

        // Fixed inverted widths: measuring thousands of record columns after
        // each switch is slow
        const colWidths = useMemo(
            () =>
                isInverted
                    ? calculateInvertedColumnWidths(table.headers)
                    : editable
                      ? calculateColumnWidths((table as TableData).headers)
                      : undefined,
            [editable, isInverted, table]
        );

        const data = useMemo(
            () =>
                isInverted
                    ? headerNames.map((name) => [
                          name,
                          ...table.records.map((record) => record[name])
                      ])
                    : table.records,
            [headerNames, isInverted, table]
        );

        const colHeaders = useMemo(
            () =>
                !isInverted
                    ? headerNames
                    : [
                          'Field Name',
                          ...table.records.map(
                              (_val, index) => `Record ${index + 1}`
                          )
                      ],
            [headerNames, isInverted, table]
        );

        const cells = useCallback(
            (
                physicalRow: number,
                physicalCol: number
            ): Handsontable.CellMeta => {
                const { table: current, tableNames } = propsRef.current;
                // fieldColumns is empty when the table isn't editable
                if (!isEditableTable(current)) {
                    return {};
                }
                return getCellMeta(physicalRow, physicalCol, {
                    table: current,
                    orientation: orientationRef.current,
                    fieldColumns,
                    writeState: writeStateRef.current,
                    tableNames: tableNames ?? NO_TABLE_NAMES
                });
            },
            [fieldColumns]
        );

        // Reference links and edit buttons: one listener for every cell
        const handleClick = useCallback((event: React.MouseEvent) => {
            const clicked = getActionTarget(event, hotRef.current?.hotInstance);
            if (!clicked) {
                return;
            }
            const { target, td, hot, row, col } = clicked;
            const cell = orientationRef.current.toRecordCell(row, col);

            const { onEditBlob, onEditReference, onFollowReference } =
                propsRef.current;
            switch (target.dataset.action) {
                case 'follow-reference':
                    onFollowReference?.(
                        Number(target.dataset.tableId),
                        Number(target.dataset.recordIndex),
                        getOpenMode(event),
                        cell ? toPosition(cell) : null
                    );
                    break;
                case 'edit-reference':
                    if (!cell) break;
                    onEditReference?.({
                        ...toPosition(cell),
                        value: String(hot.getDataAtCell(row, col) ?? ''),
                        anchorRect: td.getBoundingClientRect()
                    });
                    break;
                case 'edit-blob':
                    if (!cell) break;
                    onEditBlob?.({
                        ...toPosition(cell),
                        value: hot.getDataAtCell(row, col)
                    });
                    break;
            }
        }, []);

        // A middle-clicked reference opens in a background tab
        const handleAuxClick = useCallback((event: React.MouseEvent) => {
            const target = getNewTabReference(
                event,
                hotRef.current?.hotInstance
            );
            if (event.button === 1 && target) {
                propsRef.current.onFollowReference?.(
                    Number(target.dataset.tableId),
                    Number(target.dataset.recordIndex),
                    'background',
                    null
                );
            }
        }, []);

        // A ctrl/middle press on a reference never reaches Handsontable: a
        // ctrl+click there adds to the selection and re-renders the cell,
        // which replaces the link before the click lands on it. Also no
        // autoscroll on a middle press.
        const handleMouseDownCapture = useCallback(
            (event: React.MouseEvent) => {
                if (getNewTabReference(event, hotRef.current?.hotInstance)) {
                    event.stopPropagation();
                    if (event.button === 1) {
                        event.preventDefault();
                    }
                }
            },
            []
        );

        const beforeRenderer = useCallback((td: HTMLTableCellElement) => {
            // Cells are reused while scrolling; only error cells have a title
            td.removeAttribute('title');
        }, []);

        // Set from a table load or orientation switch until the reselect
        // below. Handsontable keeps the old visual selection through a data
        // update and reports it again, which in the new layout is another
        // record and field.
        const reselectPendingRef = useRef(false);
        useLayoutEffect(() => {
            reselectPendingRef.current = true;
        }, [table, isInverted]);

        const afterSelectionEnd = useCallback((row: number, col: number) => {
            if (reselectPendingRef.current) {
                return;
            }
            // Header clicks select from -1
            if (row >= 0 && col >= 0) {
                const selection = toPosition(
                    toSelectionCell(orientationRef.current, row, col)
                );
                lastSelectionRef.current = selection;
                propsRef.current.onSelectionChange?.(selection);
            } else {
                lastSelectionRef.current = null;
            }
        }, []);

        const afterScroll = useCallback(() => {
            const holder = getScrollHolder(hotRef);
            if (holder) {
                propsRef.current.onScroll?.({
                    top: holder.scrollTop,
                    left: holder.scrollLeft
                });
            }
        }, []);

        // Select after each table load and orientation switch. HotTable
        // applies the new data in its own effect, which runs before this one.
        // A new table (or an import reload) gets initialSelection, its scroll
        // and an empty undo history. A switch keeps the selected record and
        // field, and selectCell scrolls them into view.
        const loadedTableRef = useRef<Props['table'] | null>(null);
        const loadedInvertedRef = useRef(isInverted);
        useEffect(() => {
            const hot = hotRef.current?.hotInstance;
            const isNewTable = loadedTableRef.current !== table;
            loadedTableRef.current = table;
            if (isNewTable) {
                undo.clear();
            }
            const { initialSelection, initialScroll } = propsRef.current;
            const selection = (isNewTable
                ? initialSelection
                : lastSelectionRef.current) ?? { row: 0, col: 0 };
            reselectPendingRef.current = false;
            if (hot) {
                const [row, col] = orientationRef.current.toVisualCell(
                    toRecordCell(selection)
                );
                // Clamped: an inverted table without records only has the
                // field-name column
                const visualRow = Math.max(
                    0,
                    Math.min(row ?? 0, hot.countRows() - 1)
                );
                const visualCol = Math.max(
                    0,
                    Math.min(col, hot.countCols() - 1)
                );
                // Not scrolled when a saved position is restored below:
                // selectCell's scroll queues a scrollIntoView for the next
                // scroll event, which would move off the restored position
                const restoresScroll = isNewTable && !!initialScroll;
                hot.selectCell(
                    visualRow,
                    visualCol,
                    visualRow,
                    visualCol,
                    !restoresScroll
                );
                // A new grid (a new tab) has no height until the
                // ResizeObserver sizes it, so selectCell's scroll leaves the
                // row just above the top. The observer scrolls it to the top.
                // Kept through StrictMode's second run of this effect (same
                // table and orientation), which would otherwise drop it.
                if (isNewTable || isInverted !== loadedInvertedRef.current) {
                    revealPendingRef.current = null;
                }
                loadedInvertedRef.current = isInverted;
                if (isNewTable && initialSelection && !initialScroll) {
                    const target = { row: visualRow, col: visualCol };
                    if (getScrollHolder(hotRef)?.clientHeight) {
                        revealCell(hot, target);
                    } else {
                        revealPendingRef.current = target;
                    }
                }
            }
            const holder = getScrollHolder(hotRef);
            if (initialScroll && holder && isNewTable) {
                holder.scrollTop = initialScroll.top;
                holder.scrollLeft = initialScroll.left;
            }
            if (isNewTable || !hot) {
                return;
            }
            // A switch runs inside the Switch Orientation click, and
            // Handsontable's own document click listener (its focus scopes)
            // unlistens after it. Listen again once the click is done, so
            // keys like Ctrl+Z reach the grid.
            const timer = setTimeout(() => {
                if (!hot.isDestroyed) {
                    hot.listen();
                }
            });
            return () => clearTimeout(timer);
        }, [table, isInverted, undo]);

        // A spacing switch changes the theme's CSS variables (the compact
        // class), but Handsontable caches them, and useTheme with the current
        // name does nothing. Switching to another theme and back re-reads
        // them. useTheme scrolls to the top, so the first visible row, the
        // horizontal scroll and the selection are put back.
        const appliedCompactRef = useRef(!!compact);
        useLayoutEffect(() => {
            const hot = hotRef.current?.hotInstance;
            if (!hot || appliedCompactRef.current === !!compact) {
                return;
            }
            appliedCompactRef.current = !!compact;
            const firstRow = hot.getFirstFullyVisibleRow();
            const left = getScrollHolder(hotRef)?.scrollLeft ?? 0;
            hot.useTheme(RELOAD_THEME_NAME);
            hot.useTheme(THEME_NAME);
            if (typeof firstRow === 'number' && firstRow > 0) {
                hot.scrollViewportTo({ row: firstRow, verticalSnap: 'top' });
            }
            const holder = getScrollHolder(hotRef);
            if (holder) {
                holder.scrollLeft = left;
            }
            // The toggle's click deselected the grid (outside click)
            const selection = lastSelectionRef.current;
            if (!selection) {
                return;
            }
            const [row, col] = orientationRef.current.toVisualCell(
                toRecordCell(selection)
            );
            if (row !== null && row !== undefined) {
                hot.selectCell(row, col, row, col, false);
            }
            // As after an orientation switch, once the click is done
            const timer = setTimeout(() => {
                if (!hot.isDestroyed) {
                    hot.listen();
                }
            });
            return () => clearTimeout(timer);
        }, [compact]);

        // A paste past the grid's edge is clipped. It would add rows (records)
        // or columns (fields, or inverted records) that aren't in the file:
        // main rejects their writes, but the normal view's new rows would
        // stay in table.records and show up inverted.
        const beforeCreate = useCallback(() => false, []);

        return (
            <div
                className={cx(styles.wrapper, { [styles.compact]: compact })}
                onAuxClick={handleAuxClick}
                onClick={handleClick}
                onMouseDownCapture={handleMouseDownCapture}
                ref={wrapperRef}
            >
                <HotTable
                    afterChange={afterChange}
                    afterScrollHorizontally={afterScroll}
                    afterScrollVertically={afterScroll}
                    afterSelectionEnd={afterSelectionEnd}
                    autoColumnSize={isInverted ? false : undefined}
                    beforeChange={beforeChange}
                    beforeCreateCol={beforeCreate}
                    beforeCreateRow={beforeCreate}
                    beforeRenderer={beforeRenderer}
                    cells={cells}
                    className={styles.table}
                    colHeaders={colHeaders}
                    colWidths={colWidths}
                    columns={columns}
                    contextMenu={contextMenu}
                    currentRowClassName='active-row'
                    data={data}
                    height='100%'
                    licenseKey='non-commercial-and-evaluation' // for non-commercial use only
                    manualColumnResize={true}
                    manualRowResize={true}
                    readOnly={!editable}
                    ref={hotRef}
                    // 0-based, like v4
                    rowHeaders={
                        isInverted ? false : (index: number) => String(index)
                    }
                    themeName={THEME_NAME}
                    undo={false}
                    width='100%'
                />
            </div>
        );
    }
);

export default React.memo(TableEditorComponent);
