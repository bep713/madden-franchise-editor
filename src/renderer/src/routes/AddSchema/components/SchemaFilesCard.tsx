import { useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import Search from '@assets/icons/search.svg?react';
import Button from '@renderer/components/Button/Button';
import Card from '@renderer/components/Card/Card';
import Textbox from '@renderer/components/Textbox/Textbox';
import { dirname } from '@renderer/utils/path';
import {
    type FileRow,
    type FolderGroup,
    ROLE_LABELS,
    canBeEntry,
    filterRows,
    groupByFolder,
    worstSeverity
} from '../addSchemaModel';
import { describeProblem } from '../describeProblem';
import { useShowMore } from './ShowMore';

import styles from './SchemaFilesCard.module.css';

export type { FileRow };

interface Props {
    rows: FileRow[];
    // Generate only: include names no given file provides
    missing: string[];
    // The facts list for a ready .gz, in place of "Still needed"
    facts?: React.ReactNode;
    // The entry is the user's choice, not the detected one
    entryChosen?: boolean;
    onAddPaths: (paths: string[]) => void;
    onBrowse: (kind: 'files' | 'folder') => void;
    onRemove: (paths: string[]) => void;
    // undefined goes back to the detected entry
    onSetEntry?: (path: string | undefined) => void;
}

interface EntryProps {
    entryChosen: boolean;
    onSetEntry?: (path: string | undefined) => void;
}

export const VISIBLE_FILES = 10;
export const VISIBLE_MISSING = 5;
// An expanded folder renders this many files at a time: a folder can hold
// thousands, and rendering them all stalls every keystroke of the search
export const FOLDER_PAGE = 100;

export function droppedPaths(files: FileList | File[]): string[] {
    return Array.from(files)
        .map((file) => window.electronAPI.files.getPathForFile(file))
        .filter(Boolean);
}

const SchemaFilesCard: React.FC<Props> = ({
    rows,
    missing,
    facts,
    entryChosen = false,
    onAddPaths,
    onBrowse,
    onRemove,
    onSetEntry
}: Props) => {
    const entryProps: EntryProps = { entryChosen, onSetEntry };
    const [dragging, setDragging] = useState(false);
    const [query, setQuery] = useState('');
    // Folder keys; collapsed is the default
    const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
    const baseId = useId();

    // Every file of a folder, for its count and Remove, whatever the search
    const allByKey = useMemo(
        () =>
            new Map(
                groupByFolder(rows).map((group) => [group.key, group.rows])
            ),
        [rows]
    );
    // Typing stays responsive while a long list filters behind it
    const deferredQuery = useDeferredValue(query);
    const groups = useMemo(
        () => groupByFolder(filterRows(rows, deferredQuery)),
        [rows, deferredQuery]
    );
    // The cap counts top-level lines: folders and single files
    const items = useShowMore(groups, VISIBLE_FILES, 'files');
    const stillNeeded = useShowMore(missing, VISIBLE_MISSING, 'missing');

    // A drop that misses the zone would otherwise load the file in the window
    useEffect(() => {
        const prevent = (event: DragEvent): void => event.preventDefault();
        window.addEventListener('dragover', prevent);
        window.addEventListener('drop', prevent);
        return () => {
            window.removeEventListener('dragover', prevent);
            window.removeEventListener('drop', prevent);
        };
    }, []);

    function toggle(key: string, open: boolean): void {
        setExpanded((prev) => {
            if (prev.has(key) === open) return prev;
            const next = new Set(prev);
            if (open) next.add(key);
            else next.delete(key);
            return next;
        });
    }

    function removeAll(): void {
        onRemove(rows.map((row) => row.path));
        setQuery('');
        setExpanded(new Set());
    }

    return (
        <Card
            border='black'
            data-testid='schema-files'
            header={{ title: 'Schema files' }}
        >
            <div
                className={styles.dropZone}
                data-dragging={dragging}
                data-testid='drop-zone'
                onDragLeave={(event) => {
                    if (
                        !event.currentTarget.contains(
                            event.relatedTarget as Node | null
                        )
                    ) {
                        setDragging(false);
                    }
                }}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    onAddPaths(droppedPaths(event.dataTransfer.files));
                }}
            >
                <p className={styles.hint}>
                    Drop the entry FTX and its include files here, a folder of
                    them, or one .gz schema.
                </p>
                <p className={styles.hint}>
                    The entry is detected from the includes. Use Make entry on a
                    file to pick another.
                </p>
                <div className={styles.buttons}>
                    <Button
                        data-action='choose-files'
                        onClick={() => onBrowse('files')}
                        type='primary'
                    >
                        Choose files
                    </Button>
                    <Button
                        data-action='choose-folder'
                        onClick={() => onBrowse('folder')}
                    >
                        Choose folder
                    </Button>
                </div>
            </div>
            {rows.length > 0 && (
                <div className={styles.list}>
                    <div className={styles.searchRow}>
                        <div className={styles.search}>
                            <Textbox
                                aria-label='Search files'
                                data-field='file-search'
                                leftAsset={
                                    <Search
                                        aria-hidden
                                        height={16}
                                        width={16}
                                    />
                                }
                                onChange={(
                                    event: React.ChangeEvent<HTMLInputElement>
                                ) => setQuery(event.target.value)}
                                placeholder='Search files...'
                                text={query}
                            />
                        </div>
                        <button
                            className={styles.link}
                            data-action='remove-all'
                            onClick={removeAll}
                            type='button'
                        >
                            Remove all
                        </button>
                    </div>
                    {groups.length === 0 && (
                        <p
                            className={styles.noMatches}
                            data-testid='no-matches'
                        >
                            No files match “{deferredQuery.trim()}”.
                        </p>
                    )}
                    <ul aria-label='Files' className={styles.rows}>
                        {items.visible.map((group, index) => {
                            const all = allByKey.get(group.key) ?? group.rows;
                            if (all.length === 1) {
                                return (
                                    <FileRowItem
                                        {...entryProps}
                                        key={group.rows[0].path}
                                        onRemove={onRemove}
                                        row={group.rows[0]}
                                    />
                                );
                            }
                            return (
                                <FolderItem
                                    {...entryProps}
                                    all={all}
                                    expanded={expanded.has(group.key)}
                                    group={group}
                                    id={`${baseId}-folder-${index}`}
                                    key={group.key}
                                    onRemove={(paths) => {
                                        onRemove(paths);
                                        toggle(group.key, false);
                                    }}
                                    onRemoveFile={onRemove}
                                    onToggle={() =>
                                        toggle(
                                            group.key,
                                            !expanded.has(group.key)
                                        )
                                    }
                                />
                            );
                        })}
                    </ul>
                    {items.toggle}
                </div>
            )}
            {facts}
            {!facts && missing.length > 0 && (
                <section
                    aria-label='Still needed'
                    className={styles.missing}
                    data-testid='still-needed'
                >
                    <p className={styles.missingTitle}>
                        Still needed (
                        {missing.length > VISIBLE_MISSING &&
                            `${missing.length.toLocaleString('en-US')} files, `}
                        included by the files above):
                    </p>
                    <ul>
                        {stillNeeded.visible.map((name) => (
                            <li data-name={name} key={name}>
                                {name}
                            </li>
                        ))}
                    </ul>
                    {stillNeeded.toggle}
                </section>
            )}
        </Card>
    );
};

function count(n: number, word: string): string {
    return `${n.toLocaleString('en-US')} ${word}${n === 1 ? '' : 's'}`;
}

function entryTitle(row: FileRow, chosen: boolean): string | undefined {
    if (row.role !== 'entry') return undefined;
    return chosen ? 'Chosen by you' : 'Detected from the includes';
}

interface FileRowItemProps extends EntryProps {
    row: FileRow;
    onRemove: (paths: string[]) => void;
}

const FileRowItem: React.FC<FileRowItemProps> = ({
    row,
    onRemove,
    entryChosen,
    onSetEntry
}: FileRowItemProps) => (
    <li
        className={styles.row}
        data-name={row.name}
        data-path={row.path}
        data-role={row.role}
    >
        <div className={styles.rowLine}>
            <span className={styles.name} title={row.name}>
                {row.name}
            </span>
            {row.role && (
                <span
                    className={styles.badge}
                    data-badge={row.role}
                    title={entryTitle(row, entryChosen)}
                >
                    {ROLE_LABELS[row.role]}
                </span>
            )}
            <span className={styles.folder} title={row.path}>
                {dirname(row.path)}
            </span>
            {onSetEntry && canBeEntry(row) && (
                <button
                    aria-label={`Make ${row.name} the entry`}
                    className={styles.link}
                    data-action='set-entry'
                    onClick={() => onSetEntry(row.path)}
                    type='button'
                >
                    Make entry
                </button>
            )}
            {onSetEntry && entryChosen && row.role === 'entry' && (
                <button
                    className={styles.link}
                    data-action='reset-entry'
                    onClick={() => onSetEntry(undefined)}
                    type='button'
                >
                    Use detected
                </button>
            )}
            <button
                aria-label={`Remove ${row.name}`}
                className={styles.link}
                data-action='remove-file'
                onClick={() => onRemove([row.path])}
                type='button'
            >
                Remove
            </button>
        </div>
        {row.problems.map((problem) => (
            <p
                className={styles.rowProblem}
                data-problem={problem.code}
                data-severity={problem.severity}
                key={problem.code}
            >
                {describeProblem(problem, 'plan')}
            </p>
        ))}
    </li>
);

interface FolderItemProps extends EntryProps {
    // The rows the search shows
    group: FolderGroup;
    // Every row of the folder
    all: FileRow[];
    expanded: boolean;
    id: string;
    onToggle: () => void;
    // Removes the whole folder
    onRemove: (paths: string[]) => void;
    onRemoveFile: (paths: string[]) => void;
}

const FolderItem: React.FC<FolderItemProps> = ({
    group,
    all,
    expanded,
    id,
    onToggle,
    onRemove,
    onRemoveFile,
    ...entryProps
}: FolderItemProps) => {
    const [limit, setLimit] = useState(FOLDER_PAGE);
    const problems = all.flatMap((row) => row.problems);
    const hidden = group.rows.length - limit;
    const files =
        group.rows.length === all.length
            ? count(all.length, 'file')
            : `${group.rows.length.toLocaleString('en-US')} of ${count(all.length, 'file')}`;
    return (
        <li
            className={styles.row}
            data-count={all.length}
            data-folder={group.folder}
            data-planned={all.every((row) => row.role !== undefined)}
        >
            <div className={styles.rowLine}>
                <span className={styles.folderName} title={group.folder}>
                    {group.folder}
                </span>
                <span className={styles.count} data-testid='folder-count'>
                    {files}
                </span>
                {problems.length > 0 && (
                    <span
                        className={styles.badge}
                        data-badge='problems'
                        data-severity={worstSeverity(problems)}
                        title='Expand the folder to see them. Files with problems are listed first.'
                    >
                        {count(problems.length, 'problem')}
                    </span>
                )}
                <button
                    aria-controls={expanded ? id : undefined}
                    aria-expanded={expanded}
                    className={styles.toggleFolder}
                    data-action='toggle-folder'
                    onClick={onToggle}
                    type='button'
                >
                    {expanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                    aria-label={`Remove all files in ${group.folder}`}
                    className={styles.link}
                    data-action='remove-folder'
                    onClick={() => onRemove(all.map((row) => row.path))}
                    type='button'
                >
                    Remove
                </button>
            </div>
            {expanded && (
                <ul
                    aria-label={`Files in ${group.folder}`}
                    className={styles.nested}
                    id={id}
                >
                    {group.rows.slice(0, limit).map((row) => (
                        <FileRowItem
                            {...entryProps}
                            key={row.path}
                            onRemove={onRemoveFile}
                            row={row}
                        />
                    ))}
                    {hidden > 0 && (
                        <li>
                            <button
                                className={styles.link}
                                data-action='show-more-folder'
                                onClick={() => setLimit(limit + FOLDER_PAGE)}
                                type='button'
                            >
                                Show{' '}
                                {Math.min(hidden, FOLDER_PAGE).toLocaleString(
                                    'en-US'
                                )}{' '}
                                more of {hidden.toLocaleString('en-US')}
                            </button>
                        </li>
                    )}
                </ul>
            )}
        </li>
    );
};

export default SchemaFilesCard;
