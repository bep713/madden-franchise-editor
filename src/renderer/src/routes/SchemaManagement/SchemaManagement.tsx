import { useContext, useMemo } from 'react';
import cx from 'classnames';
import games from '@data/games.json';
import type { GameVersion, SchemaEntry } from '@shared/types';

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
import LoadedSchemaCard from './components/LoadedSchemaCard';
import PendingFileCard from './components/PendingFileCard';
import SchemaActionBar from './components/SchemaActionBar';
import SchemaCard from './components/SchemaCard';
import {
    findExpectedSchema,
    groupSchemas,
    isLoaded,
    loadedLabel,
    schemaLabel
} from './schemaList';
import useSchemaList from './useSchemaList';

import styles from './SchemaManagement.module.scss';

// 0 is the first button, Load/Delete; Cancel is the default
const CONFIRM = 0;

const SchemaManagement: React.FC = () => {
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);
    const { entries, schemaDir, refresh } = useSchemaList();
    const { loader, setOptions: setLoaderOptions } = useLoader();
    const [pending, setPending] = usePendingOpen();
    // A pending common file has its year and type, so this rarely prompts
    const { promptForOverrides, modal: commonFileModal } =
        useCommonFilePrompt();
    const openFileAt = useOpenFile({ promptForOverrides });
    const metadata = openFile?.metadata;

    const { groups, other } = useMemo(
        () => groupSchemas(entries, games as GameVersion[]),
        [entries]
    );
    const labelFor = (entry: SchemaEntry): string =>
        schemaLabel(entry, entries, schemaDir);
    const expectedEntry = findExpectedSchema(entries, metadata);

    async function confirm(
        message: string,
        detail: string,
        button: string
    ): Promise<boolean> {
        const { response } = await window.electronAPI.showMessageBox({
            type: 'warning',
            message,
            detail,
            buttons: [button, 'Cancel'],
            defaultId: 1,
            cancelId: 1
        });
        return response === CONFIRM;
    }

    async function showError(message: string, error: unknown): Promise<void> {
        await window.electronAPI.showMessageBox({
            type: 'error',
            message,
            detail: String(error)
        });
    }

    // Reopens the file from disk with this schema, so unsaved edits are lost
    async function handleLoad(entry: SchemaEntry): Promise<void> {
        if (!openFile) return;
        const label = labelFor(entry);

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
                entry.path,
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

    // Opens the pending file with this schema. Like an open from Home, this
    // closes the current file without asking. useOpenFile clears `pending`
    // on success and shows the error box on failure.
    async function handlePick(entry: SchemaEntry): Promise<void> {
        if (!pending) return;
        setLoaderOptions({ message: 'Opening file...', show: true });
        try {
            await openFileAt(pending.path, {
                ...pending.openOptions,
                schemaOverride: { path: entry.path }
            });
        } catch (error) {
            await showError('Could not open the file.', error);
        } finally {
            setLoaderOptions({ show: false });
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
        onDelete: handleDelete
    };
    const hasTopCard = !!pending || !!metadata;

    return (
        <div className={styles.page}>
            <Headline size='default' text='Schema Management' />
            <main className={styles.main}>
                <Layout alignItems='stretch' direction='column' rowGap='4'>
                    <Sticky placement='top'>
                        <div className={styles.topRow}>
                            <GameGrid className={styles.topGrid}>
                                <div
                                    className={cx(styles.cell, {
                                        [styles.actionsWithCard]: hasTopCard,
                                        [styles.actionsFull]: !hasTopCard
                                    })}
                                >
                                    <SchemaActionBar
                                        onOpenDirectory={handleOpenDirectory}
                                        onRefresh={refresh}
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
                                                setPending?.(undefined)
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
            {loader}
            {commonFileModal}
        </div>
    );
};

export default SchemaManagement;
