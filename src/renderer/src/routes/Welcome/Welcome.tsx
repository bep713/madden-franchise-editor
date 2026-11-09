import { useEffect, useState, useContext } from 'react';
import { File, GameFileList, RecentFile } from '@shared/types/files';

import styles from './Welcome.module.css';

import { Allotment } from 'allotment';
import Headline from '@renderer/components/Headline/Headline';
import Layout from '@renderer/components/Layout/Layout';

import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import useOpenFile from '@renderer/hooks/useOpenFile';
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

function toRecentFiles(entries: RecentFileEntry[]): RecentFile[] {
    return entries.map((entry) => ({
        basePath: dirname(entry.path),
        fullPath: entry.path,
        lastAccessedTime: entry.time,
        name: basename(entry.path)
    }));
}

const Welcome: React.FC = () => {
    const editorTabs = useEditorTabs();
    const [version, setVersion] = useState<string>();
    const [filesByGame, setFilesByGame] = useState<
        Record<string, GameFileList>
    >({});
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [openFile] = useContext(FranchiseFileContext);
    const { promptForOverrides, modal: commonFileModal } =
        useCommonFilePrompt();
    const openFileAt = useOpenFile({ promptForOverrides });

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

    // `overrides`: a common file's year and type, already chosen
    async function initializeFile(
        path: string,
        overrides?: CommonFileOverrides
    ): Promise<void> {
        const result = await openFileAt(path, overrides);
        if (result.status === 'opened') {
            setRecentFiles(toRecentFiles(result.recentFiles));
        }
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
                        onSettingsClick={() =>
                            window.electronAPI.send('show-preferences-window')
                        }
                        // Main reloads the window into v4 once the
                        // preference is written
                        onSwitchUiClick={() =>
                            window.electronAPI.preferences.set({
                                general: { uiVersion: 'v4' }
                            })
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
