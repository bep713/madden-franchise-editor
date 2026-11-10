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
    ErrorResult,
    GetReferencesResult,
    OpenFileResult,
    ReadTableDataResult,
    ReloadFileResult,
    SaveFileResult,
    SchemaEntry,
    SchemaFieldsResult,
    SchemaFieldsSource,
    SetNextRecordResult,
    SetRecordsEmptyResult,
    TableListItem,
    WriteBulkTableCellsResult
} from '@shared/types';
import type { GameSaveResponse } from '@shared/types/files';
import type { AppNotification } from '@shared/types/notifications';

// recent-files:* entries (main/handlers/recentFilesHandler.js)
export interface RecentFileEntry {
    path: string;
    time: number;
}

// franchise:open-file options (FranchiseFileManager._buildFileSettings)
export interface OpenFileOptions {
    gameYearOverride?: number;
    gameTypeOverride?: string;
    schemaOverride?: { path: string };
}

declare global {
    interface Window {
        franchiseAPI: {
            openFile: (
                filePath: string,
                options?: OpenFileOptions
            ) => Promise<OpenFileResult>;
            closeFile: (fileId: string) => Promise<boolean>;
            // The file main has open. loaded is false when a UI switch cut
            // the open off before file-loaded was sent.
            getActiveFile: () => Promise<{
                fileId: string;
                path: string;
                loaded: boolean;
            } | null>;
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
            // Saves to the new path; the open file and watcher move there
            saveFileAsAndOpen: (
                fileId: string,
                path: string
            ) => Promise<{ path: string } | { error: string }>;
            // Reopens the file from disk, keeping its fileId and schema.
            // Unsaved edits are lost.
            reloadFile: (fileId: string) => Promise<ReloadFileResult>;
            // Waits for queued writes/saves; undos count as changes
            hasUnsavedChanges: (fileId: string) => Promise<boolean>;
            // Bundled and custom schemas
            getSavedSchemas: () => Promise<SchemaEntry[]>;
            // Reopens the file from disk with this schema, keeping its fileId.
            // Unsaved edits are lost.
            loadSchema: (
                fileId: string,
                schemaPath: string,
                saveSchema: boolean
            ) => Promise<
                { status: 'successful'; metadata: FileMetadata } | ErrorResult
            >;
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
            // The last updater event a user acts on, or null (app:get-update-status)
            getUpdateStatus: () => Promise<{
                channel: string;
                data: unknown;
            } | null>;
            // ipcRenderer.send / on / removeAllListeners on any channel. The
            // preload has no per-callback removal.
            send: (channel: string, data?: unknown) => void;
            on: (
                channel: string,
                callback: (...args: unknown[]) => void
            ) => void;
            removeAllListeners: (channel: string) => void;
            // Notification store in main; subscribe functions return an unsubscribe
            notifications: {
                list: () => Promise<AppNotification[]>;
                dismiss: (id: string) => Promise<void>;
                markRead: (ids: string[]) => Promise<void>;
                onChanged: (
                    callback: (list: AppNotification[]) => void
                ) => () => void;
                onAdded: (
                    callback: (notification: AppNotification) => void
                ) => () => void;
            };
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
            schema: {
                // Creates <userData>/schemas if needed and returns its path
                initialize: () => Promise<string>;
                // Custom schemas only; refuses bundled and loaded ones
                delete: (
                    schemaPath: string
                ) => Promise<{ success: true } | ErrorResult>;
                // Bundled or custom schema by path, or an open file's embedded schema
                getFields: (
                    source: SchemaFieldsSource
                ) => Promise<SchemaFieldsResult | { error: string }>;
            };
            files: {
                getSaves: () => Promise<GameSaveResponse>;
                openFolder: (folderPath: string) => Promise<void>;
            };
        };
    }
}
