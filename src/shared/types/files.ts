import { GameVersion, Response } from '../types';

export interface File {
    basePath?: string;
    fullPath: string;
    mtime: number;
    name: string;
}

export interface RecentFile extends Omit<File, 'mtime'> {
    lastAccessedTime?: number;
    gameYear?: string;
}

interface Game extends Omit<GameVersion, 'directories'> {
    directories: {
        savesFullPath: string;
        savesRelativePath: string;
        gameFilesRelativePath: string;
    };
}

export interface GameFileList {
    game: Game;
    files: File[];
}

export interface GameSaveResponse extends Response {
    recentFiles: RecentFile[];
    filesByGame: Record<string, GameFileList>;
}
