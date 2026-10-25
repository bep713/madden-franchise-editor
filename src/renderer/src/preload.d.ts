// window.franchiseAPI / window.electronAPI are exposed by preload/franchisePreload.js
// (shared with the v4 renderer). Only the methods the React UI calls are declared.
import type {
    MessageBoxOptions,
    MessageBoxReturnValue,
    OpenDialogOptions,
    OpenDialogReturnValue,
    SaveDialogOptions,
    SaveDialogReturnValue
} from 'electron';
import type {
    FileMetadata,
    OpenFileResult,
    ReadTableDataResult,
    TableListItem
} from '@shared/types';
import type { GameSaveResponse } from '@shared/types/files';

// recent-files:* entries (main/handlers/recentFilesHandler.js)
export interface RecentFileEntry {
    path: string;
    time: number;
}

declare global {
    interface Window {
        franchiseAPI: {
            openFile: (
                filePath: string,
                options?: Record<string, unknown>
            ) => Promise<OpenFileResult>;
            closeFile: (fileId: string) => Promise<boolean>;
            getActiveFileId: () => Promise<string | null>;
            getMetadata: (fileId: string) => Promise<FileMetadata | null>;
            getTableList: (fileId: string) => Promise<TableListItem[]>;
            readTableData: (
                fileId: string,
                tableId: number,
                fields?: string[]
            ) => Promise<ReadTableDataResult>;
        };
        electronAPI: {
            showOpenDialog: (
                options: OpenDialogOptions
            ) => Promise<OpenDialogReturnValue>;
            showSaveDialog: (
                options: SaveDialogOptions
            ) => Promise<SaveDialogReturnValue>;
            showMessageBox: (
                options: MessageBoxOptions
            ) => Promise<MessageBoxReturnValue>;
            getVersion: () => Promise<string>;
            recentFiles: {
                initialize: () => Promise<RecentFileEntry[]>;
                addFile: (filePath: string) => Promise<RecentFileEntry[]>;
                removeFile: (filePath: string) => Promise<RecentFileEntry[]>;
                getRecentFiles: () => Promise<RecentFileEntry[]>;
            };
            externalData: {
                export: (
                    filePath: string,
                    headers: string[],
                    rows: unknown[][]
                ) => Promise<void>;
            };
            welcome: {
                revealInExplorer: (
                    filePath: string
                ) => Promise<{ success: boolean }>;
            };
            files: {
                getSaves: () => Promise<GameSaveResponse>;
                openFolder: (folderPath: string) => Promise<void>;
            };
        };
    }
}
