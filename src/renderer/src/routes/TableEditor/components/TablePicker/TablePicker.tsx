import React, { useEffect, useId, useRef, useState } from 'react';
import cx from 'classnames';
import { VariableSizeList as List } from 'react-window';
import { TableListItem } from '@shared/types';
import Search from '@assets/icons/search.svg?react';
import Pushpin from '@assets/icons/pushpin.svg?react';
import ChevronDown from '@assets/icons/chevronDown.svg?react';
import { tableTitle } from '@renderer/utils/tableTitle';
import { OpenMode, getOpenMode } from '@renderer/utils/openMode';
import { SidebarRow, rowKey } from '../TableSidebar/sidebarRows';
import styles from './TablePicker.module.scss';

const ROW_HEIGHTS: Record<SidebarRow['kind'], number> = {
    pinnedLabel: 20,
    table: 24,
    divider: 9
};
const MAX_LIST_HEIGHT = 400;

interface Props {
    // Already filtered by onFilter's text
    rows: SidebarRow[] | undefined;
    onFilter: (filterText: string) => void;
    selectedTable: { id: number; name: string } | undefined;
    onTableSelect: (table: TableListItem, mode: OpenMode) => void;
}

const titleOf = (table: Props['selectedTable']): string =>
    table ? tableTitle(table.id, table.name) : '';

// The next table row after `from` in direction `step`, or `from` if none
function nextTableIndex(
    rows: SidebarRow[],
    from: number,
    step: 1 | -1
): number {
    for (let i = from + step; i >= 0 && i < rows.length; i += step) {
        if (rows[i].kind === 'table') {
            return i;
        }
    }
    return from;
}

const firstTableIndex = (rows: SidebarRow[]): number =>
    rows.findIndex((row) => row.kind === 'table');

// The compact table editor's table list: a combobox in the header that lists
// the same rows as the sidebar (pins first)
const TablePicker: React.FC<Props> = ({
    rows,
    onFilter,
    selectedTable,
    onTableSelect
}) => {
    const listboxId = useId();
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<List>(null);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState(() => titleOf(selectedTable));
    // A row index into `rows`; -1 until the rows for a new filter arrive
    const [highlight, setHighlight] = useState(-1);
    // Set by typing: the next rows highlight their first table
    const highlightFirstRef = useRef(false);

    // Follows the shown table (a tab switch, a pick) while not typing
    const selectedTitle = titleOf(selectedTable);
    useEffect(() => {
        if (document.activeElement !== inputRef.current) {
            setText(selectedTitle);
        }
    }, [selectedTitle]);

    // Row heights are cached by index, and rows move when pins change. A new
    // filter's rows highlight their first table.
    useEffect(() => {
        listRef.current?.resetAfterIndex(0);
        if (highlightFirstRef.current && rows) {
            highlightFirstRef.current = false;
            setHighlight(firstTableIndex(rows));
            listRef.current?.scrollToItem(0);
        }
    }, [rows]);

    const close = (): void => {
        setOpen(false);
        setHighlight(-1);
        highlightFirstRef.current = false;
        setText(selectedTitle);
        onFilter('');
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>): void => {
        e.target.select();
        setOpen(true);
        const list = rows ?? [];
        const current = list.findIndex(
            (row) => row.kind === 'table' && row.table.id === selectedTable?.id
        );
        const index = current >= 0 ? current : firstTableIndex(list);
        setHighlight(index);
        // The list mounts with this render
        requestAnimationFrame(() => {
            if (index >= 0) {
                listRef.current?.scrollToItem(index, 'smart');
            }
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        setText(e.target.value);
        setOpen(true);
        highlightFirstRef.current = true;
        onFilter(e.target.value);
    };

    const select = (table: TableListItem, mode: OpenMode): void => {
        onTableSelect(table, mode);
        if (mode === 'current') {
            setOpen(false);
            setHighlight(-1);
            setText(tableTitle(table.id, table.name));
            onFilter('');
            inputRef.current?.blur();
        }
    };

    const moveHighlight = (step: 1 | -1): void => {
        if (!rows) return;
        const from = highlight >= 0 ? highlight : step === 1 ? -1 : rows.length;
        const index = nextTableIndex(rows, from, step);
        if (index >= 0 && index < rows.length) {
            setHighlight(index);
            listRef.current?.scrollToItem(index);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            moveHighlight(e.key === 'ArrowDown' ? 1 : -1);
        } else if (e.key === 'Enter') {
            const row = rows?.[highlight];
            if (open && row?.kind === 'table') {
                e.preventDefault();
                select(row.table, 'current');
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            inputRef.current?.blur();
        }
    };

    const optionId = (row: SidebarRow): string => `${listboxId}-${rowKey(row)}`;
    const highlighted = rows?.[highlight];
    const activeId =
        open && highlighted?.kind === 'table'
            ? optionId(highlighted)
            : undefined;

    const renderRow = ({
        index,
        style
    }: {
        index: number;
        style: React.CSSProperties;
    }): React.ReactNode => {
        const row = rows![index];
        if (row.kind === 'pinnedLabel') {
            return (
                <div
                    className={styles.pinnedLabel}
                    role='presentation'
                    style={style}
                >
                    Pinned
                </div>
            );
        }
        if (row.kind === 'divider') {
            return (
                <div
                    className={styles.divider}
                    role='presentation'
                    style={style}
                >
                    <hr />
                </div>
            );
        }
        const { table, pinned } = row;
        const title = tableTitle(table.id, table.name);
        return (
            <div
                aria-selected={index === highlight}
                className={cx(styles.option, {
                    [styles.highlighted]: index === highlight,
                    [styles.current]: table.id === selectedTable?.id
                })}
                data-section={row.section}
                data-table-id={table.id}
                id={optionId(row)}
                onAuxClick={(e) => {
                    if (e.button === 1) {
                        select(table, 'background');
                    }
                }}
                onClick={(e) => select(table, getOpenMode(e))}
                // Keeps focus in the input, and no autoscroll on a
                // middle-click
                onMouseDown={(e) => {
                    if (e.button === 0 || e.button === 1) {
                        e.preventDefault();
                    }
                }}
                onMouseMove={() => {
                    if (index !== highlight) setHighlight(index);
                }}
                role='option'
                style={style}
                title={title}
            >
                <span className={styles.optionText}>{title}</span>
                {pinned && (
                    <Pushpin
                        aria-label='Pinned'
                        className={styles.pin}
                        role='img'
                    />
                )}
            </div>
        );
    };

    const listHeight = Math.min(
        MAX_LIST_HEIGHT,
        (rows ?? []).reduce((sum, row) => sum + ROW_HEIGHTS[row.kind], 0)
    );

    return (
        <div className={styles.wrapper}>
            <div className={styles.inputBox}>
                <Search aria-hidden className={styles.searchIcon} />
                <input
                    aria-activedescendant={activeId}
                    aria-autocomplete='list'
                    aria-controls={listboxId}
                    aria-expanded={open}
                    aria-label='Table'
                    autoComplete='off'
                    className={styles.input}
                    data-testid='table-picker'
                    onBlur={close}
                    onChange={handleChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    placeholder='Search tables...'
                    ref={inputRef}
                    role='combobox'
                    spellCheck={false}
                    type='text'
                    value={text}
                />
                {/* Opens or closes the list. Not focusable: the input is
                    the control. */}
                <span
                    aria-hidden
                    className={cx(styles.chevron, {
                        [styles.chevronOpen]: open
                    })}
                    data-testid='table-picker-toggle'
                    onMouseDown={(e) => {
                        if (e.button !== 0) return;
                        // Keeps focus where it is until toggled below
                        e.preventDefault();
                        if (open) {
                            inputRef.current?.blur();
                        } else {
                            inputRef.current?.focus();
                        }
                    }}
                >
                    <ChevronDown />
                </span>
            </div>
            {open && rows && (
                <div className={styles.popup} id={listboxId} role='listbox'>
                    {rows.length === 0 ? (
                        <div className={styles.empty}>No tables found</div>
                    ) : (
                        <List
                            height={listHeight}
                            itemCount={rows.length}
                            itemKey={(index: number) => rowKey(rows[index])}
                            itemSize={(index: number) =>
                                ROW_HEIGHTS[rows[index].kind]
                            }
                            overscanCount={8}
                            ref={listRef}
                            width='100%'
                        >
                            {renderRow}
                        </List>
                    )}
                </div>
            )}
        </div>
    );
};

export default TablePicker;
