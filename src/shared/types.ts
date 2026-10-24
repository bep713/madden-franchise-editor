export * from './types/franchise';
export * from './types/navigation';

export interface Version {
    version: string;
}

export interface Response {
    success: boolean;
    error?: Error;
}

export interface GameVersion {
    abbreviation?: string;
    directories: {
        gameFilesRelativePath: string;
        savesRelativePath: string;
    };
    gameYear: number;
    isSupported: boolean;
    iconPath: string;
    shortTitle: string;
    title: string;
    year: string;
}
