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
import { resolveReference } from '@renderer/utils/references';
import { WriteState } from '@renderer/utils/cellWrites';
import { OpenMode, getOpenMode } from '@renderer/utils/openMode';

import { buildColumns, calculateColumnWidths } from './columns';
import { createReferenceRenderer } from './renderers/referenceRenderer';
import { blobRenderer } from './renderers/blobRenderer';
import { errorRenderer } from './renderers/errorRenderer';
import useCellWrites, { createWriteState } from './useCellWrites';
import styles from './TableEditorComponent.module.css';

registerAllModules();

// A table that is only displayed (e.g. the expression editor's output)
interface ReadOnlyTable {
    headers: Pick<TableColumn, 'name'>[];
    records: TableData['records'];
}

export interface CellPosition {
    row: number;
    col: number;
}

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
}

interface Props {
    isInverted?: boolean;
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
    onFollowReference?: (
        tableId: number,
        recordIndex: number,
        mode: OpenMode
    ) => void;
    onEditReference?: (request: ReferenceEditRequest) => void;
    onEditBlob?: (request: BlobEditRequest) => void;
}

// The element that scrolls the grid's viewport
function getScrollHolder(hotRef: React.RefObject<HotTableRef>) {
    return hotRef.current?.hotInstance?.rootElement.querySelector<HTMLElement>(
        '.ht_master .wtHolder'
    );
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
// updateSettings on each render, and Handsontable reloads `data` whenever it
// is passed, which clears the undo stack and the selection. So every prop has
// to be stable, and the hooks read the latest props from propsRef.
const TableEditorComponent = forwardRef<GridHandle, Props>(
    function TableEditorComponent(props, ref) {
        const { isInverted, table } = props;
        const hotRef = useRef<HotTableRef>(null);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const propsRef = useRef(props);
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

        const editable =
            !isInverted && !!props.fileId && isEditableTable(table);

        useLayoutEffect(() => {
            if (isEditableTable(table)) {
                writeStateRef.current = createWriteState(table);
            }
        }, [table]);

        useEffect(() => {
            // Handle window resizing so that the table always takes up the entire remaining space.
            const observer = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (entry.contentBoxSize) {
                        const size = entry.contentBoxSize[0];
                        hotRef?.current?.hotInstance?.updateSettings({
                            height: size.blockSize,
                            width: size.inlineSize
                        });
                    }
                }
            });

            if (wrapperRef.current) {
                observer.observe(wrapperRef.current);
            }

            return () => observer.disconnect();
        }, []);

        useImperativeHandle(
            ref,
            () => ({
                setDataAtCell: (row, col, value) =>
                    hotRef.current?.hotInstance?.setDataAtCell(row, col, value),
                selectCell: (row, col) =>
                    hotRef.current?.hotInstance?.selectCell(row, col)
            }),
            []
        );

        const { beforeChange, afterChange } = useCellWrites(
            hotRef,
            () => {
                const { fileId, setLoaderOptions } = propsRef.current;
                const current = propsRef.current.table;
                if (
                    !fileId ||
                    !setLoaderOptions ||
                    !isEditableTable(current) ||
                    propsRef.current.isInverted
                ) {
                    return null;
                }
                return { fileId, table: current, setLoaderOptions };
            },
            writeStateRef
        );

        const referenceRenderer = useMemo(
            () =>
                createReferenceRenderer(
                    () => propsRef.current.tableNames ?? NO_TABLE_NAMES
                ),
            []
        );

        const headerNames = useMemo(
            () => table.headers.map((header) => header.name),
            [table]
        );

        const columns = useMemo(
            () =>
                editable
                    ? buildColumns((table as TableData).headers, {
                          reference: referenceRenderer,
                          blob: blobRenderer
                      })
                    : isInverted
                      ? undefined
                      : headerNames.map((name) => ({ data: name })),
            [editable, headerNames, isInverted, referenceRenderer, table]
        );

        const colWidths = useMemo(
            () =>
                editable
                    ? calculateColumnWidths((table as TableData).headers)
                    : undefined,
            [editable, table]
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

        // v4's _getCellProperties. Every property is returned on every call,
        // because Handsontable keeps what an earlier call set (for example the
        // empty class after a row is un-emptied).
        const cells = useCallback(
            (
                physicalRow: number,
                physicalCol: number
            ): Handsontable.CellMeta => {
                const { table: current, isInverted: inverted } =
                    propsRef.current;
                if (inverted || !isEditableTable(current)) {
                    return {};
                }

                const header = current.headers[physicalCol];
                const column = columns?.[physicalCol] as
                    Handsontable.ColumnSettings | undefined;
                if (!header || !column) {
                    return {};
                }

                const { cellErrors, emptyRecordIndices } =
                    writeStateRef.current;
                const errorMessage = cellErrors[physicalRow]?.[header.name];
                if (errorMessage) {
                    return {
                        className: 'table-cell--error',
                        readOnly: true,
                        editor: false,
                        renderer: errorRenderer,
                        errorMessage
                    };
                }

                let editor = column.editor;
                if (
                    header.isReference &&
                    resolveReference(
                        current.records[physicalRow]?.[header.name],
                        propsRef.current.tableNames ?? NO_TABLE_NAMES
                    )
                ) {
                    // A link to another table can't be typed into
                    editor = false;
                }

                return {
                    className: emptyRecordIndices.has(physicalRow)
                        ? 'table-cell--empty'
                        : '',
                    readOnly: false,
                    editor,
                    renderer: column.renderer,
                    errorMessage: undefined
                };
            },
            [columns]
        );

        // Reference links and edit buttons: one listener for every cell
        const handleClick = useCallback((event: React.MouseEvent) => {
            const clicked = getActionTarget(event, hotRef.current?.hotInstance);
            if (!clicked) {
                return;
            }
            const { target, td, hot, row, col } = clicked;

            const { onEditBlob, onEditReference, onFollowReference } =
                propsRef.current;
            switch (target.dataset.action) {
                case 'follow-reference':
                    onFollowReference?.(
                        Number(target.dataset.tableId),
                        Number(target.dataset.recordIndex),
                        getOpenMode(event)
                    );
                    break;
                case 'edit-reference':
                    onEditReference?.({
                        row,
                        col,
                        value: String(hot.getDataAtCell(row, col) ?? ''),
                        anchorRect: td.getBoundingClientRect()
                    });
                    break;
                case 'edit-blob':
                    onEditBlob?.({
                        row,
                        col,
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
                    'background'
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

        const afterSelectionEnd = useCallback((row: number, col: number) => {
            // Header clicks select from -1
            if (row >= 0 && col >= 0) {
                propsRef.current.onSelectionChange?.({ row, col });
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

        // Select after each table load. HotTable applies the new data in its
        // own effect, which runs before this one. The scroll is restored only
        // for a new table, not when the orientation changes.
        const scrolledTableRef = useRef<Props['table'] | null>(null);
        useEffect(() => {
            const { initialSelection, initialScroll } = propsRef.current;
            hotRef.current?.hotInstance?.selectCell(
                initialSelection?.row ?? 0,
                initialSelection?.col ?? 0
            );
            const holder = getScrollHolder(hotRef);
            if (initialScroll && holder && scrolledTableRef.current !== table) {
                holder.scrollTop = initialScroll.top;
                holder.scrollLeft = initialScroll.left;
            }
            scrolledTableRef.current = table;
        }, [table, isInverted]);

        return (
            <div
                className={styles.wrapper}
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
                    autoWrapCol={true}
                    autoWrapRow={true}
                    beforeChange={beforeChange}
                    beforeRenderer={beforeRenderer}
                    cells={cells}
                    className={cx(styles.table, {
                        [styles.inverted]: isInverted
                    })}
                    colHeaders={colHeaders}
                    colWidths={colWidths}
                    columns={columns}
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
                    themeName='ht-theme-main'
                    width='100%'
                />
            </div>
        );
    }
);

export default React.memo(TableEditorComponent);
