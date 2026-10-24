// window.api is exposed by preload/franchisePreload.js.
import type { OpenDialogOptions, SaveDialogOptions } from 'electron';
import type {
    ExportTableDataInput,
    ExportTableDataResult,
    FranchiseModel,
    FranchiseTableDataResult,
    ReadTableDataInput,
    Version
} from '@shared/types';
import type { GameSaveResponse, RecentFile } from '@shared/types/files';

declare global {
    interface Window {
        api: {
            general: {
                openDialog: (
                    options?: OpenDialogOptions
                ) => Promise<string | null>;
                saveDialog: (
                    options?: SaveDialogOptions
                ) => Promise<string | null>;
                getVersion: () => Promise<Version>;
            };
            files: {
                getRecentFiles: () => Promise<RecentFile[]>;
                getSaves: () => Promise<GameSaveResponse>;
                openFolder: (folderPath: string) => Promise<void>;
                removeRecentFile: (file: RecentFile) => Promise<void>;
                showItemInFolder: (path: string) => Promise<void>;
            };
            franchise: {
                closeFranchiseFile: (id: string) => Promise<boolean>;
                getActiveFranchiseFiles: () => Promise<FranchiseModel[]>;
                initializeFranchiseFile: (
                    filePath: string
                ) => Promise<FranchiseModel>;
                readTableData: (
                    input: ReadTableDataInput
                ) => Promise<FranchiseTableDataResult>;
                exportTableData: (
                    params: ExportTableDataInput
                ) => Promise<ExportTableDataResult>;
            };
        };
    }
}

export {};
