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
    CellWrite,
    GetReferencesResult,
    OpenFileResult,
    ReadTableDataResult,
    SaveFileResult,
    SetNextRecordResult,
    SetRecordsEmptyResult,
    TableListItem,
    WriteBulkTableCellsResult
} from '@shared/types';
import type { GameSaveResponse } from '@shared/types/files';

// recent-files:* entries (main/handlers/recentFilesHandler.js)
export interface RecentFileEntry {
    path: string;
    time: number;
}

// franchise:open-file options (FranchiseFileManager._buildFileSettings)
export interface OpenFileOptions {
    gameYearOverride?: number;
    gameTypeOverride?: string;
}

declare global {
    interface Window {
        franchiseAPI: {
            openFile: (
                filePath: string,
                options?: OpenFileOptions
            ) => Promise<OpenFileResult>;
            closeFile: (fileId: string) => Promise<boolean>;
            getActiveFileId: () => Promise<string | null>;
            getMetadata: (fileId: string) => Promise<FileMetadata | null>;
            // A header sniff before opening; format is null if unreadable
            getMetadataFromFilePath: (
                filePath: string
            ) => Promise<{ format: string | null }>;
            getTableList: (fileId: string) => Promise<TableListItem[]>;
            readTableData: (
                fileId: string,
                tableId: number,
                fields?: string[]
            ) => Promise<ReadTableDataResult>;
            writeBulkTableCells: (
                fileId: string,
                changes: CellWrite[]
            ) => Promise<WriteBulkTableCellsResult>;
            setTableRecordsEmpty: (
                fileId: string,
                tableId: number,
                recordIndices: number[]
            ) => Promise<SetRecordsEmptyResult>;
            setTableNextRecordToUse: (
                fileId: string,
                tableId: number,
                recordIndex: number
            ) => Promise<SetNextRecordResult>;
            getReferencesToRecord: (
                fileId: string,
                tableId: number,
                recordIndex: number
            ) => Promise<GetReferencesResult>;
            saveFile: (
                fileId: string,
                options?: { sync?: boolean }
            ) => Promise<SaveFileResult>;
            saveFileAs: (
                fileId: string,
                filePath: string
            ) => Promise<SaveFileResult>;
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
            // ipcRenderer.send / on / removeAllListeners on any channel. The
            // preload has no per-callback removal.
            send: (channel: string, data?: unknown) => void;
            on: (
                channel: string,
                callback: (...args: unknown[]) => void
            ) => void;
            removeAllListeners: (channel: string) => void;
            preferences: {
                getValue: (keyPath: string) => Promise<unknown>;
                // Writes only the given keys of each section
                set: (
                    prefs: Record<string, Record<string, unknown>>
                ) => Promise<void>;
            };
            // JSON files in userData (fs:read-json / fs:write-json)
            fs: {
                readJson: (filename: string) => Promise<unknown | null>;
                writeJson: (filename: string, data: unknown) => Promise<void>;
            };
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
                // Rows keyed by column name
                import: (
                    filePath: string
                ) => Promise<Record<string, unknown>[]>;
                // Saves when saveOnChange is on
                importBulk: (
                    fileId: string,
                    tableId: number,
                    rows: Record<string, unknown>[]
                ) => Promise<{ success: boolean }>;
                rawExport: (
                    fileId: string,
                    tableId: number,
                    filePath: string
                ) => Promise<void>;
                frtExport: (fileId: string, filePath: string) => Promise<void>;
                rawImport: (
                    fileId: string,
                    tableId: number,
                    filePath: string
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
