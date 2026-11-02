import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import games from '@data/games.json';
import { FileMetadata, GameVersion, TableListItem } from '@shared/types';
import { OpenFranchiseFile } from '@renderer/context/FranchiseFileContext';

export function buildOpenFranchiseFile(
    fileId: string,
    metadata: FileMetadata,
    tables: TableListItem[],
    path?: string
): OpenFranchiseFile {
    return {
        fileId,
        path,
        metadata,
        tables: tables.map((table, index) => ({ ...table, index })),
        game: findGame(metadata)
    };
}

// Madden and College Football share game years, so match on the type too.
// Files without a gameType are Madden, as in v4.
export function findGame(metadata: FileMetadata): GameVersion | undefined {
    const gameType = metadata.type?.gameType || 'madden';
    return (games as GameVersion[]).find(
        (game) =>
            game.gameYear === metadata.gameYear && game.gameType === gameType
    );
}

export default function useActiveFranchiseFile(): [
    OpenFranchiseFile | undefined,
    Dispatch<SetStateAction<OpenFranchiseFile | undefined>>
] {
    const [openFile, setOpenFile] = useState<OpenFranchiseFile | undefined>();

    useEffect(() => {
        // Restore the file main still has open (e.g. after a renderer reload)
        (async (): Promise<void> => {
            const fileId = await window.franchiseAPI.getActiveFileId();
            if (!fileId) {
                return;
            }

            const [metadata, tables] = await Promise.all([
                window.franchiseAPI.getMetadata(fileId),
                window.franchiseAPI.getTableList(fileId)
            ]);
            if (metadata) {
                setOpenFile(buildOpenFranchiseFile(fileId, metadata, tables));
            }
        })();
    }, []);

    return [openFile, setOpenFile];
}
