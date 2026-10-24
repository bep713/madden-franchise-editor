import React, { useRef, useState } from 'react';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';
import { FranchiseBaseTableModel } from '@shared/types';
import styles from './TableSidebar.module.scss';
import Textbox from '@renderer/components/Textbox/Textbox';
import TableListItem from '@renderer/components/TableListItem/TableListItem';
import searchIconUrl from '@assets/icons/search.svg';

const ROW_HEIGHT = 63;
const GUTTER_SIZE = 4;

interface TableSidebarProps {
    onFilter?: (filterText: string) => void;
    onTableSelect?: (table: FranchiseBaseTableModel) => void;
    selectedTableId: number;
    tables?: FranchiseBaseTableModel[];
}

const TableSidebar: React.FC<TableSidebarProps> = ({
    onFilter,
    onTableSelect,
    selectedTableId,
    tables
}: TableSidebarProps) => {
    const [filterText, setFilterText] = useState<string>('');
    const listRef = useRef<List>();

    if (!tables) {
        return null;
    }

    const handleFilterChange = (
        e: React.ChangeEvent<HTMLInputElement>
    ): void => {
        setFilterText(e.target.value);
        listRef.current?.scrollToItem(0);
        onFilter?.(e.target.value);
    };

    const renderListItem = ({ index, style }): React.ReactNode => {
        const item = tables[index];

        return (
            <TableListItem
                component='button'
                componentProps={{
                    onClick: () => onTableSelect?.(item),
                    style: {
                        ...style,
                        top: style.top + GUTTER_SIZE,
                        height: style.height - GUTTER_SIZE
                    }
                }}
                emphasisText={filterText}
                table={{
                    ...item,
                    selected: item.id === selectedTableId
                }}
            />
        );
    };

    return (
        <div className={styles.wrapper}>
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
            <div className={styles.autoSizerWrapper}>
                <AutoSizer>
                    {({ height, width }) => (
                        <List
                            height={height}
                            itemCount={tables.length}
                            itemSize={ROW_HEIGHT}
                            overscanCount={8}
                            ref={listRef}
                            width={width}
                        >
                            {renderListItem}
                        </List>
                    )}
                </AutoSizer>
            </div>
        </div>
    );
};

export default TableSidebar;
