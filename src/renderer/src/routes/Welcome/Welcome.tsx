import { useEffect, useState, useContext } from 'react';
import { File, GameFileList, RecentFile } from '@shared/types/files';

import styles from './Welcome.module.css';

import { Allotment } from 'allotment';
import Headline from '@renderer/components/Headline/Headline';
import Layout from '@renderer/components/Layout/Layout';

import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { buildOpenFranchiseFile } from '@renderer/hooks/useActiveFranchiseFile';
import type { RecentFileEntry } from '@renderer/preload';
import { basename, dirname } from '@renderer/utils/path';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import SideNav from './SideNav';
import Card from '@renderer/components/Card/Card';
import RecentFilesList from '@renderer/components/RecentFilesList/RecentFilesList';
import GameFileCard from '@renderer/components/GameFilesCard/GameFilesCard';
import GetStartedCard, { GetStartedActions } from './Cards/GetStartedCard';

function toRecentFiles(entries: RecentFileEntry[]): RecentFile[] {
    return entries.map((entry) => ({
        basePath: dirname(entry.path),
        fullPath: entry.path,
        lastAccessedTime: entry.time,
        name: basename(entry.path)
    }));
}

// general.defaultEditor: the editor to open after a file loads. A failed
// read counts as Home.
async function readDefaultEditor(): Promise<unknown> {
    try {
        return await window.electronAPI.preferences.getValue(
            'general.defaultEditor'
        );
    } catch (error) {
        console.error('Failed to read general.defaultEditor', error);
        return 'open-home';
    }
}

const Welcome: React.FC = () => {
    const editorTabs = useEditorTabs();
    const [version, setVersion] = useState<string>();
    const [filesByGame, setFilesByGame] = useState<
        Record<string, GameFileList>
    >({});
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);

    useEffect((): void => {
        (async (): Promise<void> => {
            setVersion(await window.electronAPI.getVersion());
        })();
    }, []);

    useEffect((): void => {
        (async (): Promise<void> => {
            const gameSavesResponse = await window.electronAPI.files.getSaves();
            if (gameSavesResponse.success) {
                setFilesByGame(gameSavesResponse.filesByGame);
            }
        })();
    }, []);

    useEffect((): void => {
        // Loads recentFiles.json in main, as v4's recentFileService does
        (async (): Promise<void> => {
            await window.electronAPI.recentFiles.initialize();
            setRecentFiles(
                toRecentFiles(
                    await window.electronAPI.recentFiles.getRecentFiles()
                )
            );
        })();
    }, []);

    async function handleOpenFile(): Promise<void> {
        const result = await window.electronAPI.showOpenDialog({
            title: 'Select franchise file to open',
            properties: ['openFile'],
            filters: [
                {
                    name: 'Franchise file',
                    extensions: ['*']
                }
            ]
        });

        if (!result.canceled && result.filePaths[0]) {
            await initializeFile(result.filePaths[0]);
        }
    }

    // Follows v4's navigationService "open-file" flow. TODO: FTC year/type
    // overrides and the schema picker (see react-conversion/plan.md).
    async function initializeFile(path: string): Promise<void> {
        // Release the previous file so two parsed files never coexist in main
        if (openFile) {
            setOpenFile?.(undefined);
            await window.franchiseAPI.closeFile(openFile.fileId);
        }

        const result = await window.franchiseAPI.openFile(path);
        if ('error' in result) {
            await window.electronAPI.showMessageBox({
                type: 'error',
                message: `Could not open ${basename(path)}.`,
                detail: result.error
            });
            return;
        }

        const [tables, defaultEditor] = await Promise.all([
            window.franchiseAPI.getTableList(result.fileId),
            readDefaultEditor()
        ]);
        setRecentFiles(
            toRecentFiles(await window.electronAPI.recentFiles.addFile(path))
        );
        const file = buildOpenFranchiseFile(
            result.fileId,
            result.metadata,
            tables,
            path
        );
        // In the same tick, so the tab bar renders once, already showing the
        // default editor (v4's navigationService open-file handler)
        setOpenFile?.(file);
        if (defaultEditor === 'open-table-editor') {
            editorTabs.openTableEditor(file);
        }
        // TODO(04+): open-schedule and open-schema-viewer, once React has
        // those pages. Until then they stay on Home.
        // Main sets the title, enables the file menu items and starts
        // watching the file. A restore after a renderer reload skips this,
        // since main still has that state (same as v4).
        window.electronAPI.send('file-loaded', {
            path,
            type: result.metadata.type,
            fileId: result.fileId
        });
    }

    return (
        <Layout alignItems='stretch' rowGap='none' direction='column'>
            <Headline
                size='default'
                subtext={version && `v${version}`}
                text='Madden Franchise Editor'
            />
            <Allotment defaultSizes={[1, 4]}>
                <Allotment.Pane minSize={235} snap>
                    <SideNav />
                </Allotment.Pane>
                <Allotment.Pane>
                    <main className={styles.main}>
                        <Layout
                            alignItems='stretch'
                            direction='column'
                            justifyContent='space-between'
                            rowGap='4'
                        >
                            <GetStartedCard
                                openFile={openFile}
                                onActionClick={async (action) => {
                                    switch (action) {
                                        case GetStartedActions.OPEN_FILE:
                                            await handleOpenFile();
                                            break;
                                        case GetStartedActions.OPEN_FILE_LOCATION:
                                            if (openFile?.path) {
                                                window.electronAPI.welcome.revealInExplorer(
                                                    openFile.path
                                                );
                                            }
                                            break;
                                        case GetStartedActions.OPEN_TABLE_EDITOR:
                                            editorTabs.openTableEditor();
                                            break;
                                        // OPEN_SCHEMA_MANAGEMENT: no page yet
                                    }
                                }}
                            />
                            <Card
                                data-testid='recent-files'
                                header={{ title: 'Recent Files' }}
                            >
                                <RecentFilesList
                                    onClick={(r: RecentFile) =>
                                        initializeFile(r.fullPath)
                                    }
                                    files={recentFiles}
                                />
                            </Card>
                            {filesByGame && (
                                <div className={styles.filesByGame}>
                                    {Object.entries(filesByGame)
                                        .sort(
                                            (
                                                [, gameFilesA],
                                                [, gameFilesB]
                                            ) => {
                                                return (
                                                    Number(
                                                        gameFilesB.game.year
                                                    ) -
                                                    Number(gameFilesA.game.year)
                                                );
                                            }
                                        )
                                        .map(([game, gameFiles]) => (
                                            <GameFileCard
                                                key={game}
                                                files={gameFiles}
                                                onDirectoryClick={() =>
                                                    window.electronAPI.files.openFolder(
                                                        gameFiles.game
                                                            .directories
                                                            .savesFullPath
                                                    )
                                                }
                                                onFileClick={(file: File) =>
                                                    initializeFile(
                                                        file.fullPath
                                                    )
                                                }
                                            />
                                        ))}
                                </div>
                            )}
                        </Layout>
                    </main>
                </Allotment.Pane>
            </Allotment>
        </Layout>
    );
};

export default Welcome;
