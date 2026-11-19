import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import cx from 'classnames';
import AutoSizer from 'react-virtualized-auto-sizer';
import { FixedSizeList as List } from 'react-window';
import type { SchemaField, SchemaFieldsSource } from '@shared/types';
import Close from '@assets/icons/close.svg?react';
import Link from '@renderer/components/Link/Link';
import Loader from '@renderer/components/Loader/Loader';
import {
    EMPTY_FILTERS,
    exactFilter,
    filterFields,
    hasFilters,
    nextSort,
    referencedTable,
    sortFields,
    type FieldFilters,
    type FieldSort,
    type SchemaColumn
} from '../../schemaViewer';
import { sourceKey, useSchemaFields } from './useSchemaFields';
import styles from './SchemaViewer.module.css';

// Matches .row's height in the CSS module
const ROW_HEIGHT = 28;

const FILTER_INPUTS: { key: keyof FieldFilters; label: string }[] = [
    { key: 'field', label: 'Field' },
    { key: 'table', label: 'Table' },
    { key: 'type', label: 'Type' }
];

const COLUMNS: { column: SchemaColumn; label: string }[] = [
    { column: 'name', label: 'Field' },
    { column: 'table', label: 'Table' },
    { column: 'type', label: 'Type' }
];

interface Props {
    source: SchemaFieldsSource;
    label: string;
    // Held by the page so they survive a source change
    filters: FieldFilters;
    onFiltersChange: (filters: FieldFilters) => void;
    onClose: () => void;
}

const SchemaViewer: React.FC<Props> = ({
    source,
    label,
    filters,
    onFiltersChange,
    onClose
}: Props) => {
    const key = sourceKey(source);
    const { fields, tableNames, loading, error, retry } =
        useSchemaFields(source);
    const [sort, setSort] = useState<FieldSort>(null);
    const [sortKey, setSortKey] = useState(key);
    const listRef = useRef<List>(null);

    // The sort belongs to one schema
    if (sortKey !== key) {
        setSortKey(key);
        setSort(null);
    }

    const deferred = useDeferredValue(filters);
    // Sort first, so typing a filter doesn't re-sort (filtering keeps order)
    const sorted = useMemo(() => sortFields(fields, sort), [fields, sort]);
    const visible = useMemo(
        () => filterFields(sorted, deferred),
        [sorted, deferred]
    );

    useEffect(() => {
        listRef.current?.scrollTo(0);
    }, [key, deferred, sort]);

    const filtering = hasFilters(filters);
    const firstLoad = loading && fields.length === 0;

    function showTable(table: string): void {
        onFiltersChange({ field: '', type: '', table: exactFilter(table) });
    }

    function ariaSort(column: SchemaColumn): React.AriaAttributes['aria-sort'] {
        if (sort?.column !== column) return 'none';
        return sort.dir === 'asc' ? 'ascending' : 'descending';
    }

    function renderCell(text: string, content: React.ReactNode = text) {
        return (
            <div className={styles.cell} role='cell' title={text}>
                {content}
            </div>
        );
    }

    function renderRow({
        index,
        style
    }: {
        index: number;
        style: React.CSSProperties;
    }): React.ReactNode {
        const f = visible[index];
        const ref = referencedTable(f.type, tableNames);
        return (
            <div
                aria-rowindex={index + 2}
                className={cx(styles.columns, styles.row)}
                data-field={f.name}
                data-table={f.table}
                data-type={f.type}
                role='row'
                style={style}
            >
                {renderCell(f.name)}
                {renderCell(
                    f.table,
                    <button
                        className={styles.cellLink}
                        data-action='filter-table'
                        onClick={() => showTable(f.table)}
                        type='button'
                    >
                        {f.table}
                    </button>
                )}
                {renderCell(
                    f.type,
                    ref ? (
                        <button
                            className={styles.cellLink}
                            data-action='jump-type'
                            onClick={() => showTable(ref)}
                            type='button'
                        >
                            {f.type}
                        </button>
                    ) : (
                        f.type
                    )
                )}
            </div>
        );
    }

    function renderBody(): React.ReactNode {
        if (error !== null) {
            return (
                <div className={styles.message} role='alert'>
                    <p>Could not read this schema.</p>
                    <p className={styles.detail}>{error}</p>
                    <Link data-action='retry' onClick={retry} text='Retry' />
                </div>
            );
        }
        if (firstLoad) {
            return (
                <div className={styles.loading}>
                    <Loader />
                </div>
            );
        }
        return (
            <div
                aria-rowcount={visible.length + 1}
                className={styles.table}
                role='table'
            >
                <div
                    aria-rowindex={1}
                    className={cx(styles.columns, styles.headerRow)}
                    role='row'
                >
                    {COLUMNS.map(({ column, label: text }) => (
                        <div
                            aria-sort={ariaSort(column)}
                            className={styles.columnHeader}
                            key={column}
                            role='columnheader'
                        >
                            <button
                                data-sort-column={column}
                                onClick={() => setSort(nextSort(sort, column))}
                                type='button'
                            >
                                {text}
                                {sort?.column === column &&
                                    (sort.dir === 'asc' ? ' ▲' : ' ▼')}
                            </button>
                        </div>
                    ))}
                </div>
                {visible.length === 0 ? (
                    <p className={styles.empty}>
                        No fields match these filters
                    </p>
                ) : (
                    <div className={styles.body}>
                        <AutoSizer>
                            {({ height, width }) => (
                                <List
                                    height={height}
                                    itemCount={visible.length}
                                    itemKey={(index: number) =>
                                        fieldKey(visible[index])
                                    }
                                    itemSize={ROW_HEIGHT}
                                    ref={listRef}
                                    width={width}
                                >
                                    {renderRow}
                                </List>
                            )}
                        </AutoSizer>
                    </div>
                )}
            </div>
        );
    }

    return (
        <aside aria-label='Schema viewer' className={styles.viewer}>
            <header className={styles.header}>
                <h2 className={styles.title}>{label} Schema Viewer</h2>
                <button
                    aria-label='Close schema viewer'
                    className={styles.iconButton}
                    onClick={onClose}
                    type='button'
                >
                    <Close aria-hidden='true' />
                </button>
            </header>
            <div className={styles.filters}>
                <div className={styles.inputs}>
                    {FILTER_INPUTS.map(({ key: filterKey, label: text }) => (
                        <div className={styles.filter} key={filterKey}>
                            <label htmlFor={`schema-filter-${filterKey}`}>
                                {text}
                            </label>
                            <input
                                data-filter={filterKey}
                                id={`schema-filter-${filterKey}`}
                                onChange={(e) =>
                                    onFiltersChange({
                                        ...filters,
                                        [filterKey]: e.target.value
                                    })
                                }
                                type='text'
                                value={filters[filterKey]}
                            />
                        </div>
                    ))}
                </div>
                <div className={styles.filterFooter}>
                    <span className={styles.hint}>
                        Wrap in &quot;quotes&quot; for an exact match
                    </span>
                    <Link
                        data-action='clear-filters'
                        disabled={!filtering}
                        onClick={() => onFiltersChange(EMPTY_FILTERS)}
                        text='Clear filters'
                    />
                </div>
            </div>
            {error === null && !firstLoad && (
                <p className={styles.count} data-testid='field-count'>
                    {/* The deferred filters, so the count matches the rows */}
                    {hasFilters(deferred)
                        ? `${visible.length.toLocaleString()} of ${fields.length.toLocaleString()} fields`
                        : `${fields.length.toLocaleString()} fields`}
                </p>
            )}
            {renderBody()}
        </aside>
    );
};

// Unique within a schema
function fieldKey(f: SchemaField): string {
    return `${f.table}.${f.name}`;
}

export default SchemaViewer;
