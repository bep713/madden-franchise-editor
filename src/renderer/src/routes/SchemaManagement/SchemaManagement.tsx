import { useContext, useMemo, useState } from 'react';
import { Allotment } from 'allotment';
import cx from 'classnames';
import { useLocation, useNavigate } from 'react-router-dom';
import games from '@data/games.json';
import type {
    AddedSchema,
    GameVersion,
    SchemaEntry,
    SchemaFieldsSource
} from '@shared/types';

import Banner, { type BannerAction } from '@renderer/components/Banner/Banner';
import GameGrid from '@renderer/components/GameGrid/GameGrid';
import Headline from '@renderer/components/Headline/Headline';
import Layout from '@renderer/components/Layout/Layout';
import Sticky from '@renderer/components/Sticky/Sticky';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { usePendingOpen } from '@renderer/context/PendingOpenContext';
import { buildOpenFranchiseFile } from '@renderer/hooks/useActiveFranchiseFile';
import useLoader from '@renderer/hooks/useLoader';
import useOpenFile from '@renderer/hooks/useOpenFile';
import useCommonFilePrompt from '@renderer/routes/Welcome/components/CommonFileModal/useCommonFilePrompt';
import { confirm } from '@renderer/utils/confirm';
import { basename } from '@renderer/utils/path';
import { gameLabel } from '../AddSchema/addSchemaModel';
import { describeProblem } from '../AddSchema/describeProblem';
import LoadedSchemaCard from './components/LoadedSchemaCard';
import PendingFileCard from './components/PendingFileCard';
import SchemaActionBar from './components/SchemaActionBar';
import SchemaCard from './components/SchemaCard';
import SchemaViewer from './components/SchemaViewer/SchemaViewer';
import {
    findExpectedSchema,
    groupSchemas,
    isLoaded,
    loadedLabel,
    samePath,
    schemaLabel
} from './schemaList';
import { EMPTY_FILTERS, type FieldFilters } from './schemaViewer';
import useSchemaList from './useSchemaList';

import styles from './SchemaManagement.module.scss';

interface Viewing {
    source: SchemaFieldsSource;
    // The header when no list entry has the source's path
    fallbackLabel: string;
    // An embedded schema belongs to this revision of the file
    fileRevision?: number;
}

function viewingPathOf(viewing: Viewing | null): string | undefined {
    return viewing && 'path' in viewing.source
        ? viewing.source.path
        : undefined;
}

function addedMessage(added: AddedSchema): string {
    const { identity } = added;
    const label = `${gameLabel(identity, games as GameVersion[])} ${identity.major}.${identity.minor}`;
    return added.replaced ? `Replaced your custom ${label}` : `Added ${label}`;
}

const SchemaManagement: React.FC = () => {
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);
    const navigate = useNavigate();
    const location = useLocation();
    // The Add schema page's result, for this visit only
    const [added, setAdded] = useState<AddedSchema | null>(
        () => (location.state as { added?: AddedSchema } | null)?.added ?? null
    );
    const { entries, schemaDir, refresh } = useSchemaList();
    const { loader, setOptions: setLoaderOptions } = useLoader();
    const [pending, setPending] = usePendingOpen();
    // A pending common file has its year and type, so this rarely prompts
    const { promptForOverrides, modal: commonFileModal } =
        useCommonFilePrompt();
    const openFileAt = useOpenFile({ promptForOverrides, setLoaderOptions });
    const metadata = openFile?.metadata;

    const { groups, other } = useMemo(
        () => groupSchemas(entries, games as GameVersion[]),
        [entries]
    );
    const labelFor = (entry: SchemaEntry): string =>
        schemaLabel(entry, entries, schemaDir);
    const expectedEntry = findExpectedSchema(entries, metadata);

    const [viewing, setViewing] = useState<Viewing | null>(null);
    // Kept when the pane switches schemas, reset when it closes
    const [filters, setFilters] = useState<FieldFilters>(EMPTY_FILTERS);
    const viewingPath = viewingPathOf(viewing);
    const viewingEntry = viewingPath
        ? entries.find((entry) => samePath(entry.path, viewingPath))
        : undefined;

    function closeViewer(): void {
        setViewing(null);
        setFilters(EMPTY_FILTERS);
    }

    function viewEntry(entry: SchemaEntry): void {
        if (samePath(entry.path, viewingPath)) return;
        setViewing({
            source: { path: entry.path },
            fallbackLabel: labelFor(entry)
        });
    }

    // By path when the list has the loaded schema, so it stays on it after
    // another load. Otherwise (embedded, or outside both dirs) by file.
    function viewLoaded(): void {
        if (!openFile) return;
        const entry = entries.find((e) => isLoaded(e, metadata));
        if (entry) {
            viewEntry(entry);
            return;
        }
        setViewing({
            source: { fileId: openFile.fileId },
            fallbackLabel: loadedLabel(metadata, entries, schemaDir),
            fileRevision: openFile.revision
        });
    }

    // Closes the pane during render, as SchemaViewer resets its sort:
    // - a refresh or a delete dropped the viewed path. The pane only opens
    //   once the list has loaded, so the initial empty list can't close it.
    // - an embedded schema's file closed, changed or reloaded (new revision).
    //   A path stays on its schema.
    const stale =
        !!viewing &&
        ('path' in viewing.source
            ? !viewingEntry
            : viewing.source.fileId !== openFile?.fileId ||
              viewing.fileRevision !== openFile?.revision);
    if (stale) {
        closeViewer();
    }

    async function showError(message: string, error: unknown): Promise<void> {
        await window.electronAPI.showMessageBox({
            type: 'error',
            message,
            detail: String(error)
        });
    }

    // Reopens the file from disk with this schema, so unsaved edits are lost
    async function loadSchemaAt(path: string, label: string): Promise<void> {
        if (!openFile) return;

        let dirty = true;
        try {
            dirty = await window.franchiseAPI.hasUnsavedChanges(
                openFile.fileId
            );
        } catch (error) {
            // Prompt anyway
            console.error('Failed to check for unsaved changes', error);
        }
        if (
            dirty &&
            !(await confirm(
                `Load schema ${label}?`,
                'The file is reopened from disk. Unsaved changes will be lost.',
                'Load'
            ))
        ) {
            return;
        }

        setLoaderOptions({ message: 'Loading schema...', show: true });
        try {
            const result = await window.franchiseAPI.loadSchema(
                openFile.fileId,
                path,
                false
            );
            if ('error' in result) {
                setLoaderOptions({ show: false });
                await showError(
                    `Could not load schema ${label}.`,
                    result.error
                );
                return;
            }
            const tables = await window.franchiseAPI.getTableList(
                openFile.fileId
            );
            // A new revision keeps the active tab and rebuilds the table tabs
            setOpenFile?.(
                buildOpenFranchiseFile(
                    openFile.fileId,
                    result.metadata,
                    tables,
                    openFile.path,
                    openFile.revision + 1
                )
            );
            setLoaderOptions({ show: false });
        } catch (error) {
            setLoaderOptions({ show: false });
            await showError(`Could not load schema ${label}.`, error);
        }
    }

    function handleLoad(entry: SchemaEntry): Promise<void> {
        return loadSchemaAt(entry.path, labelFor(entry));
    }

    async function handleUndoAdd(): Promise<void> {
        try {
            const result = await window.electronAPI.schema.restorePrevious();
            if ('error' in result) {
                await showError('Could not undo the add.', result.error);
            } else if (result.status === 'gone') {
                await window.electronAPI.showMessageBox({
                    type: 'info',
                    message: 'Nothing to undo.',
                    detail: 'The added schema changed, or another add replaced it.'
                });
            }
        } catch (error) {
            await showError('Could not undo the add.', error);
        }
        await refresh();
    }

    function addedActions(result: AddedSchema): BannerAction[] {
        const entry = entries.find((e) => samePath(e.path, result.path));
        // Only the open file can take the new copy
        const user = result.loadedBy.find(
            (by) => by.fileId === openFile?.fileId
        );
        return [
            ...(entry
                ? [
                      {
                          label: 'View',
                          onClick: () => viewEntry(entry),
                          primary: true
                      }
                  ]
                : []),
            ...(result.replaced
                ? [{ label: 'Undo', onClick: () => void handleUndoAdd() }]
                : []),
            ...(user
                ? [
                      {
                          label: `Use it in ${basename(user.filePath)}`,
                          onClick: () =>
                              void loadSchemaAt(
                                  result.path,
                                  entry ? labelFor(entry) : result.fileName
                              )
                      }
                  ]
                : [])
        ];
    }

    // Opens the pending file with this schema. Like an open from Home, this
    // closes the current file without asking. useOpenFile clears `pending`
    // on success and shows the error box on failure.
    async function handlePick(entry: SchemaEntry): Promise<void> {
        if (!pending) return;
        try {
            await openFileAt(pending.path, {
                ...pending.openOptions,
                schemaOverride: { path: entry.path }
            });
        } catch (error) {
            await showError('Could not open the file.', error);
        }
    }

    async function handleDelete(entry: SchemaEntry): Promise<void> {
        if (
            !(await confirm(
                `Delete schema ${labelFor(entry)}?`,
                entry.path,
                'Delete'
            ))
        ) {
            return;
        }
        try {
            const result = await window.electronAPI.schema.delete(entry.path);
            if ('error' in result) {
                await showError('Could not delete the schema.', result.error);
            } else if (samePath(entry.path, viewingPath)) {
                closeViewer();
            }
        } catch (error) {
            await showError('Could not delete the schema.', error);
        }
        await refresh();
    }

    async function handleOpenDirectory(): Promise<void> {
        try {
            const dir = await window.electronAPI.schema.initialize();
            await window.electronAPI.files.openFolder(dir);
        } catch (error) {
            await showError('Could not open the schema directory.', error);
        }
    }

    const cardProps = {
        labelFor,
        metadata,
        picking: !!pending,
        onLoad: pending ? handlePick : handleLoad,
        onDelete: handleDelete,
        onView: viewEntry,
        viewingPath
    };
    const hasTopCard = !!pending || !!metadata;

    return (
        <div className={styles.page}>
            <Headline size='default' text='Schema Management' />
            <div className={styles.panes}>
                <Allotment
                    onVisibleChange={(index, visible) => {
                        if (index === 1 && !visible) closeViewer();
                    }}
                >
                    <Allotment.Pane>
                        <main className={styles.main}>
                            <Layout
                                alignItems='stretch'
                                direction='column'
                                rowGap='4'
                            >
                                <Sticky placement='top'>
                                    <div className={styles.topRow}>
                                        <GameGrid className={styles.topGrid}>
                                            <div
                                                className={cx(styles.cell, {
                                                    [styles.actionsWithCard]:
                                                        hasTopCard,
                                                    [styles.actionsFull]:
                                                        !hasTopCard
                                                })}
                                            >
                                                <SchemaActionBar
                                                    onAddSchema={() =>
                                                        navigate(
                                                            '/schema-management/add'
                                                        )
                                                    }
                                                    onOpenDirectory={
                                                        handleOpenDirectory
                                                    }
                                                    onRefresh={refresh}
                                                    onViewLoaded={
                                                        metadata?.schemaList
                                                            ?.meta && !pending
                                                            ? viewLoaded
                                                            : undefined
                                                    }
                                                />
                                            </div>
                                            {pending && (
                                                <div
                                                    className={cx(
                                                        styles.cell,
                                                        styles.loadedCard
                                                    )}
                                                >
                                                    <PendingFileCard
                                                        onCancel={() =>
                                                            setPending?.(
                                                                undefined
                                                            )
                                                        }
                                                        pending={pending}
                                                    />
                                                </div>
                                            )}
                                            {!pending && metadata && (
                                                <div
                                                    className={cx(
                                                        styles.cell,
                                                        styles.loadedCard
                                                    )}
                                                >
                                                    <LoadedSchemaCard
                                                        expectedEntry={
                                                            expectedEntry &&
                                                            !isLoaded(
                                                                expectedEntry,
                                                                metadata
                                                            )
                                                                ? expectedEntry
                                                                : null
                                                        }
                                                        loadedLabel={loadedLabel(
                                                            metadata,
                                                            entries,
                                                            schemaDir
                                                        )}
                                                        metadata={metadata}
                                                        onLoad={handleLoad}
                                                    />
                                                </div>
                                            )}
                                        </GameGrid>
                                    </div>
                                </Sticky>
                                <GameGrid data-testid='schema-grid'>
                                    {groups.map(({ game, schemas }) => (
                                        <SchemaCard
                                            game={game}
                                            key={`${game.gameType}-${game.gameYear}`}
                                            schemas={schemas}
                                            title={`${game.shortTitle} Schemas`}
                                            {...cardProps}
                                        />
                                    ))}
                                    {other.length > 0 && (
                                        <SchemaCard
                                            schemas={other}
                                            title='Other schemas'
                                            {...cardProps}
                                        />
                                    )}
                                </GameGrid>
                            </Layout>
                        </main>
                    </Allotment.Pane>
                    <Allotment.Pane
                        minSize={360}
                        preferredSize='45%'
                        snap
                        visible={!!viewing}
                    >
                        {/* No key per schema: the viewer resets its sort
                            and keeps the old rows while the next load */}
                        {viewing && (
                            <SchemaViewer
                                filters={filters}
                                label={
                                    viewingEntry
                                        ? labelFor(viewingEntry)
                                        : viewing.fallbackLabel
                                }
                                onClose={closeViewer}
                                onFiltersChange={setFilters}
                                source={viewing.source}
                            />
                        )}
                    </Allotment.Pane>
                </Allotment>
            </div>
            {added && (
                <Banner
                    actions={addedActions(added)}
                    kind='schema-added'
                    message={addedMessage(added)}
                    onClose={() => setAdded(null)}
                    severity='success'
                    visible
                >
                    {added.warnings.length > 0 && (
                        <ul className={styles.addedWarnings}>
                            {added.warnings.map((warning, index) => (
                                <li
                                    data-problem={warning.code}
                                    key={`${warning.code}-${index}`}
                                >
                                    {describeProblem(warning, 'result')}
                                </li>
                            ))}
                        </ul>
                    )}
                </Banner>
            )}
            {loader}
            {commonFileModal}
        </div>
    );
};

export default SchemaManagement;
