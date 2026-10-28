import React, { useEffect, useRef, useState } from 'react';
import cx from 'classnames';
import AutoSizer from 'react-virtualized-auto-sizer';
import { VariableSizeList as List } from 'react-window';
import { TableListItem as TableListEntry } from '@shared/types';
import styles from './TableSidebar.module.scss';
import Textbox from '@renderer/components/Textbox/Textbox';
import TableListItem from '@renderer/components/TableListItem/TableListItem';
import Text from '@renderer/components/Text/Text';
import searchIconUrl from '@assets/icons/search.svg';
import Pushpin from '@assets/icons/pushpin.svg?react';
import Unpin from '@assets/icons/unpin.svg?react';
import { SidebarRow } from './sidebarRows';
import { OpenMode, getOpenMode } from '@renderer/utils/openMode';

const TABLE_ROW_HEIGHT = 63;
const PINNED_LABEL_HEIGHT = 24;
const DIVIDER_HEIGHT = 13;
const GUTTER_SIZE = 4;

const ROW_HEIGHTS: Record<SidebarRow['kind'], number> = {
    pinnedLabel: PINNED_LABEL_HEIGHT,
    table: TABLE_ROW_HEIGHT,
    divider: DIVIDER_HEIGHT
};

const rowKey = (row: SidebarRow): string =>
    row.kind === 'table' ? `${row.section}-${row.table.id}` : row.kind;

interface TableSidebarProps {
    onFilter?: (filterText: string) => void;
    onTableSelect?: (table: TableListEntry, mode: OpenMode) => void;
    onTogglePin?: (table: TableListEntry) => void;
    onTogglePinnedVisible?: () => void;
    rows?: SidebarRow[];
    selectedTableId: number;
    showPinnedTables: boolean;
}

const TableSidebar: React.FC<TableSidebarProps> = ({
    onFilter,
    onTableSelect,
    onTogglePin,
    onTogglePinnedVisible,
    rows,
    selectedTableId,
    showPinnedTables
}: TableSidebarProps) => {
    const [filterText, setFilterText] = useState<string>('');
    const listRef = useRef<List>();

    // Row heights are cached by index, and rows move when pins change
    useEffect(() => {
        listRef.current?.resetAfterIndex(0);
    }, [rows]);

    if (!rows) {
        return null;
    }

    const handleFilterChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ): void => {
        setFilterText(e.target.value);
        listRef.current?.scrollToItem(0);
        onFilter?.(e.target.value);
    };

    const renderRow = ({ index, style }): React.ReactNode => {
        const row = rows[index];

        if (row.kind === 'pinnedLabel') {
            return (
                <div className={styles.pinnedLabel} style={style}>
                    <Text typography='labelSmall'>Pinned</Text>
                </div>
            );
        }

        if (row.kind === 'divider') {
            return (
                <div className={styles.divider} style={style}>
                    <hr />
                </div>
            );
        }

        const { table, pinned, section } = row;

        return (
            <div
                className={styles.tableRow}
                data-section={section}
                style={{
                    ...style,
                    top: style.top + GUTTER_SIZE,
                    height: style.height - GUTTER_SIZE
                }}
            >
                <TableListItem
                    component='button'
                    componentProps={{
                        onClick: (e: React.MouseEvent) =>
                            onTableSelect?.(table, getOpenMode(e)),
                        onAuxClick: (e: React.MouseEvent) => {
                            if (e.button === 1) {
                                onTableSelect?.(table, 'background');
                            }
                        },
                        // No autoscroll on a middle-click
                        onMouseDown: (e: React.MouseEvent) => {
                            if (e.button === 1) {
                                e.preventDefault();
                            }
                        },
                        style: { width: '100%', height: '100%' }
                    }}
                    emphasisText={filterText}
                    table={{
                        ...table,
                        pinned,
                        selected: table.id === selectedTableId
                    }}
                />
                <button
                    aria-label={`${pinned ? 'Unpin' : 'Pin'} ${table.name}`}
                    className={styles.pinButton}
                    onClick={() => onTogglePin?.(table)}
                    title={pinned ? 'Unpin' : 'Pin'}
                    type='button'
                >
                    {pinned ? <Unpin /> : <Pushpin />}
                </button>
            </div>
        );
    };

    return (
        <div className={styles.wrapper}>
            <div className={styles.header}>
                <div className={styles.search}>
                    <Textbox
                        leftAsset={
                            <img
                                alt={'Search icon'}
                                height={16}
                                loading='lazy'
                                src={searchIconUrl}
                                width={16}
                            />
                        }
                        onChange={handleFilterChange}
                        placeholder='Search tables...'
                        text={filterText}
                    />
                </div>
                <button
                    aria-pressed={showPinnedTables}
                    className={cx(styles.pinToggle, {
                        [styles.pinToggleOff]: !showPinnedTables
                    })}
                    onClick={onTogglePinnedVisible}
                    title={
                        showPinnedTables
                            ? 'Hide pinned tables'
                            : 'Show pinned tables'
                    }
                    type='button'
                >
                    <Pushpin />
                </button>
            </div>
            <div className={styles.autoSizerWrapper}>
                <AutoSizer>
                    {({ height, width }) => (
                        <List
                            height={height}
                            itemCount={rows.length}
                            itemKey={(index: number) => rowKey(rows[index])}
                            itemSize={(index: number) =>
                                ROW_HEIGHTS[rows[index].kind]
                            }
                            overscanCount={8}
                            ref={listRef}
                            width={width}
                        >
                            {renderRow}
                        </List>
                    )}
                </AutoSizer>
            </div>
        </div>
    );
};

export default TableSidebar;
