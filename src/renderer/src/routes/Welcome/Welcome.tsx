import { useEffect, useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { FranchiseModel, Version } from '@shared/types';
import { File, GameFileList, RecentFile } from '@shared/types/files';

import styles from './Welcome.module.css';

import { Allotment } from 'allotment';
import Headline from '@renderer/components/Headline/Headline';
import Layout from '@renderer/components/Layout/Layout';

import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import SideNav from './SideNav';
import Card from '@renderer/components/Card/Card';
import RecentFilesList from '@renderer/components/RecentFilesList/RecentFilesList';
import GameFileCard from '@renderer/components/GameFilesCard/GameFilesCard';
import GetStartedCard, { GetStartedActions } from './Cards/GetStartedCard';

const Welcome: React.FC = () => {
    const navigate = useNavigate();
    const [version, setVersion] = useState<Version>();
    const [filesByGame, setFilesByGame] = useState<
        Record<string, GameFileList>
    >({});
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [loadedFranchiseModel, setLoadedFranchiseModel] =
        useContext(FranchiseFileContext);

    useEffect((): void => {
        // Get app version
        (async (): Promise<void> => {
            const version = await window.api.general.getVersion();
            setVersion(version);
        })();
    }, []);

    useEffect((): void => {
        // Get game saves and recent files
        (async (): Promise<void> => {
            const gameSavesResponse = await window.api.files.getSaves();
            if (gameSavesResponse.success) {
                setFilesByGame(gameSavesResponse.filesByGame);
                setRecentFiles(gameSavesResponse.recentFiles);
            }
        })();
    }, []);

    useEffect((): void => {
        // Get recent files after loading a new franchise file
        (async (): Promise<void> => {
            const recentFiles = await window.api.files.getRecentFiles();
            if (recentFiles && recentFiles.length > 0) {
                setRecentFiles(recentFiles);
            }
        })();
    }, [loadedFranchiseModel]);

    async function handleOpenFile(): Promise<void> {
        if (loadedFranchiseModel) {
            await window.api.franchise.closeFranchiseFile(
                loadedFranchiseModel.franchiseId
            );
        }

        const path = await window.api.general.openDialog({
            title: 'Select franchise file to open',
            properties: ['openFile'],
            filters: [
                {
                    name: 'Franchise file',
                    extensions: ['*']
                }
            ]
        });

        if (path) {
            await initializeFile(path);
        }
    }

    async function initializeFile(path: string): Promise<void> {
        const model: FranchiseModel =
            await window.api.franchise.initializeFranchiseFile(path);
        setLoadedFranchiseModel?.(model);
    }

    return (
        <Layout alignItems='stretch' rowGap='none' direction='column'>
            <Headline
                size='default'
                subtext={version && `v${version.version}`}
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
                                franchiseModel={loadedFranchiseModel}
                                onActionClick={async (action) => {
                                    switch (action) {
                                        case GetStartedActions.OPEN_FILE:
                                            await handleOpenFile();
                                            break;
                                        case GetStartedActions.OPEN_FILE_LOCATION:
                                            if (
                                                loadedFranchiseModel &&
                                                loadedFranchiseModel.filePath
                                            ) {
                                                window.api.files.showItemInFolder(
                                                    loadedFranchiseModel?.filePath
                                                );
                                            }
                                            break;
                                        case GetStartedActions.OPEN_TABLE_EDITOR:
                                            navigate('/table-editor');
                                            break;
                                        case GetStartedActions.OPEN_SCHEMA_MANAGEMENT:
                                            navigate('/schema-management');
                                            break;
                                    }
                                }}
                            />
                            <Card header={{ title: 'Recent Files' }}>
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
                                                    window.api.files.openFolder(
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
