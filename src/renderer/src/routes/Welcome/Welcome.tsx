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
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import SideNav from './SideNav';
import Card from '@renderer/components/Card/Card';
import GameGrid from '@renderer/components/GameGrid/GameGrid';
import RecentFilesList from '@renderer/components/RecentFilesList/RecentFilesList';
import GameFileCard from '@renderer/components/GameFilesCard/GameFilesCard';
import GetStartedCard, { GetStartedActions } from './Cards/GetStartedCard';
import useCommonFilePrompt, {
    CommonFileOverrides
} from './components/CommonFileModal/useCommonFilePrompt';
import { getRememberedChoice } from './components/CommonFileModal/commonFileChoices';
import { FileType } from '@shared/types/franchise';

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
    const { promptForOverrides, modal: commonFileModal } =
        useCommonFilePrompt();

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

    // Follows v4's navigationService "open-file" flow. TODO: the schema
    // picker (see react-conversion/plan.md). `overrides`: a common file's
    // year and type, already chosen.
    async function initializeFile(
        path: string,
        overrides?: CommonFileOverrides
    ): Promise<void> {
        // Common files don't record their year or type, so use the file's
        // remembered choice or ask, as v4 does
        let openOptions = overrides;
        if (!openOptions) {
            const { format } =
                await window.franchiseAPI.getMetadataFromFilePath(path);
            if (format === FileType.COMMON) {
                const remembered = await getRememberedChoice(path);
                const chosen = remembered
                    ? {
                          gameYearOverride: remembered.gameYear,
                          gameTypeOverride: remembered.gameType
                      }
                    : await promptForOverrides(path);
                // Cancelled: keep the current file open
                if (!chosen) return;
                openOptions = chosen;
            }
        }

        // Release the previous file so two parsed files never coexist in main
        if (openFile) {
            setOpenFile?.(undefined);
            await window.franchiseAPI.closeFile(openFile.fileId);
        }

        const result = await window.franchiseAPI.openFile(path, openOptions);
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
        } else if (defaultEditor === 'open-schema-viewer') {
            editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY, file);
        }
        // TODO(04+): open-schedule, once React has that page. Until then it
        // stays on Home.
        // Main sets the title, enables the file menu items and starts
        // watching the file. A restore after a renderer reload skips this,
        // since main still has that state (same as v4).
        window.electronAPI.send('file-loaded', {
            path,
            type: result.metadata.type,
            fileId: result.fileId
        });
    }

    // Asks again for the open common file's year and type, then re-opens it
    // if they changed. The prompt warns that unsaved changes are lost.
    async function changeCommonFileParameters(): Promise<void> {
        if (!openFile?.path) return;
        const { path, metadata } = openFile;
        // Files without a gameType are Madden, as in findGame
        const current = {
            gameYear: metadata.gameYear,
            gameType: metadata.type?.gameType || 'madden'
        };
        const overrides = await promptForOverrides(path, {
            initial: current,
            remembered: !!(await getRememberedChoice(path)),
            reopen: true
        });
        if (
            !overrides ||
            (overrides.gameYearOverride === current.gameYear &&
                overrides.gameTypeOverride === current.gameType)
        ) {
            return;
        }
        await initializeFile(path, overrides);
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
                    <SideNav
                        onSchemaManagementClick={() =>
                            editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY)
                        }
                    />
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
                                        case GetStartedActions.CHANGE_FILE_PARAMETERS:
                                            await changeCommonFileParameters();
                                            break;
                                        case GetStartedActions.OPEN_TABLE_EDITOR:
                                            editorTabs.openTableEditor();
                                            break;
                                        case GetStartedActions.OPEN_SCHEMA_MANAGEMENT:
                                            editorTabs.selectTab(
                                                SCHEMA_MANAGEMENT_KEY
                                            );
                                            break;
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
                                <GameGrid>
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
                                </GameGrid>
                            )}
                        </Layout>
                    </main>
                </Allotment.Pane>
            </Allotment>
            {commonFileModal}
        </Layout>
    );
};

export default Welcome;
