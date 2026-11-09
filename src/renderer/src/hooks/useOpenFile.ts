import { useContext } from 'react';
import { FileType } from '@shared/types/franchise';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { buildOpenFranchiseFile } from '@renderer/hooks/useActiveFranchiseFile';
import type { RecentFileEntry } from '@renderer/preload';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import { basename } from '@renderer/utils/path';
import type { CommonFileOverrides } from '@renderer/routes/Welcome/components/CommonFileModal/useCommonFilePrompt';
import { getRememberedChoice } from '@renderer/routes/Welcome/components/CommonFileModal/commonFileChoices';

// A common file's year and type, already chosen, and/or a schema to load the
// file with
export type OpenFileOverrides = Partial<CommonFileOverrides> & {
    schemaOverride?: { path: string };
};

export type OpenFileResult =
    | { status: 'opened'; recentFiles: RecentFileEntry[] }
    | { status: 'cancelled' }
    | { status: 'error'; error: string; code?: string };

// general.defaultEditor: the editor to open after a file loads. A failed
// read counts as Home.
async function readDefaultEditor(): Promise<unknown> {
    try {
        return await window.electronAPI.preferences.getValue(
            'general.defaultEditor'
        );
    } catch (error) {
        console.error('Failed to read general.defaultEditor', error);
        return 'open-home';
    }
}

// Follows v4's navigationService "open-file" flow. `promptForOverrides` is
// from useCommonFilePrompt, whose modal the caller renders.
export default function useOpenFile({
    promptForOverrides
}: {
    promptForOverrides: (path: string) => Promise<CommonFileOverrides | null>;
}): (path: string, overrides?: OpenFileOverrides) => Promise<OpenFileResult> {
    const editorTabs = useEditorTabs();
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);

    return async function openFileAt(
        path: string,
        overrides?: OpenFileOverrides
    ): Promise<OpenFileResult> {
        // Common files don't record their year or type, so use the file's
        // remembered choice or ask, as v4 does
        let openOptions = overrides;
        if (!openOptions?.gameYearOverride || !openOptions.gameTypeOverride) {
            const { format } =
                await window.franchiseAPI.getMetadataFromFilePath(path);
            if (format === FileType.COMMON) {
                const remembered = await getRememberedChoice(path);
                const chosen = remembered
                    ? {
                          gameYearOverride: remembered.gameYear,
                          gameTypeOverride: remembered.gameType
                      }
                    : await promptForOverrides(path);
                // Cancelled: keep the current file open
                if (!chosen) return { status: 'cancelled' };
                // A year or type the caller passed wins over the chosen one
                openOptions = {
                    ...overrides,
                    gameYearOverride:
                        overrides?.gameYearOverride ?? chosen.gameYearOverride,
                    gameTypeOverride:
                        overrides?.gameTypeOverride ?? chosen.gameTypeOverride
                };
            }
        }

        // Release the previous file so two parsed files never coexist in main
        if (openFile) {
            setOpenFile?.(undefined);
            await window.franchiseAPI.closeFile(openFile.fileId);
        }

        const result = await window.franchiseAPI.openFile(path, openOptions);
        if ('error' in result) {
            await window.electronAPI.showMessageBox({
                type: 'error',
                message: `Could not open ${basename(path)}.`,
                detail: result.error
            });
            return { status: 'error', error: result.error, code: result.code };
        }

        const [tables, defaultEditor] = await Promise.all([
            window.franchiseAPI.getTableList(result.fileId),
            readDefaultEditor()
        ]);
        const recentFiles = await window.electronAPI.recentFiles.addFile(path);
        const file = buildOpenFranchiseFile(
            result.fileId,
            result.metadata,
            tables,
            path
        );
        // In the same tick, so the tab bar renders once, already showing the
        // default editor (v4's navigationService open-file handler)
        setOpenFile?.(file);
        if (defaultEditor === 'open-table-editor') {
            editorTabs.openTableEditor(file);
        } else if (defaultEditor === 'open-schema-viewer') {
            editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY, file);
        }
        // TODO(04+): open-schedule, once React has that page. Until then it
        // stays on Home.
        // Main sets the title, enables the file menu items and starts
        // watching the file. A restore after a reload or UI switch only sends
        // it if the open was cut off before this (useActiveFranchiseFile).
        window.electronAPI.send('file-loaded', {
            path,
            type: result.metadata.type,
            fileId: result.fileId
        });
        return { status: 'opened', recentFiles };
    };
}
