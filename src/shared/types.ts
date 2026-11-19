export * from './types/addSchema';
export * from './types/franchise';
export * from './types/navigation';
export * from './types/notifications';
export * from './types/pins';
export * from './types/schedule';
export * from './types/schemas';

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
    gameType: string;
    gameYear: number;
    isSupported: boolean;
    iconPath: string;
    shortTitle: string;
    title: string;
    year: string;
}
