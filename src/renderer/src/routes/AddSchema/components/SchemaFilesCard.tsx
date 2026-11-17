import { useEffect, useState } from 'react';
import type { FileRole, Problem } from '@shared/types';
import Button from '@renderer/components/Button/Button';
import Card from '@renderer/components/Card/Card';
import { dirname } from '@renderer/utils/path';
import { ROLE_LABELS } from '../addSchemaModel';
import { describeProblem } from '../describeProblem';
import { useShowMore } from './ShowMore';

import styles from './SchemaFilesCard.module.css';

export interface FileRow {
    path: string;
    name: string;
    // Unset until main has planned the file
    role?: FileRole;
    problems: Problem[];
}

interface Props {
    rows: FileRow[];
    // Generate only: include names no given file provides
    missing: string[];
    // The facts list for a ready .gz, in place of "Still needed"
    facts?: React.ReactNode;
    onAddPaths: (paths: string[]) => void;
    onBrowse: (kind: 'files' | 'folder') => void;
    onRemove: (path: string) => void;
}

export const VISIBLE_FILES = 10;
export const VISIBLE_MISSING = 5;

export function droppedPaths(files: FileList | File[]): string[] {
    return Array.from(files)
        .map((file) => window.electronAPI.files.getPathForFile(file))
        .filter(Boolean);
}

const SchemaFilesCard: React.FC<Props> = ({
    rows,
    missing,
    facts,
    onAddPaths,
    onBrowse,
    onRemove
}: Props) => {
    const [dragging, setDragging] = useState(false);
    const files = useShowMore(rows, VISIBLE_FILES, 'files');
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
                    <ul aria-label='Files' className={styles.rows}>
                        {files.visible.map((row) => (
                            <li
                                className={styles.row}
                                data-name={row.name}
                                data-path={row.path}
                                data-role={row.role}
                                key={row.path}
                            >
                                <div className={styles.rowLine}>
                                    <span
                                        className={styles.name}
                                        title={row.name}
                                    >
                                        {row.name}
                                    </span>
                                    {row.role && (
                                        <span
                                            className={styles.badge}
                                            data-badge={row.role}
                                        >
                                            {ROLE_LABELS[row.role]}
                                        </span>
                                    )}
                                    <span
                                        className={styles.folder}
                                        title={row.path}
                                    >
                                        {dirname(row.path)}
                                    </span>
                                    <button
                                        aria-label={`Remove ${row.name}`}
                                        className={styles.remove}
                                        data-action='remove-file'
                                        onClick={() => onRemove(row.path)}
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
                        ))}
                    </ul>
                    {files.toggle}
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

export default SchemaFilesCard;
