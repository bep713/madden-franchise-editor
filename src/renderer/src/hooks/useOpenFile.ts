import { useContext, useRef } from 'react';
import type { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import { getNavigationItems } from '@data/navigation';
import { FileType } from '@shared/types/franchise';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { usePendingOpen } from '@renderer/context/PendingOpenContext';
import { buildOpenFranchiseFile } from '@renderer/hooks/useActiveFranchiseFile';
import type { RecentFileEntry } from '@renderer/preload';
import { useEditorTabs } from '@renderer/tabs/EditorTabsContext';
import { SCHEDULE_KEY, SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
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
    // Another open from this hook hadn't finished
    | { status: 'busy' }
    | { status: 'missing'; recentFiles: RecentFileEntry[] }
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

function showOpenError(path: string, detail: string): Promise<unknown> {
    return window.electronAPI.showMessageBox({
        type: 'error',
        message: `Could not open ${basename(path)}.`,
        detail
    });
}

// A parse quicker than this shows no loader, so it doesn't flash
export const OPEN_LOADER_DELAY_MS = 300;

// Returns a stop function that is safe to call more than once
function startLoader(setLoaderOptions?: LoaderOptionsSetter): () => void {
    if (!setLoaderOptions) return () => undefined;
    const timer = setTimeout(
        () => setLoaderOptions({ message: 'Opening file...', show: true }),
        OPEN_LOADER_DELAY_MS
    );
    return () => {
        clearTimeout(timer);
        setLoaderOptions({ show: false });
    };
}

// Follows v4's welcomeService existence check and navigationService
// "open-file" flow. `promptForOverrides` is from useCommonFilePrompt, whose
// modal the caller renders, as it renders the loader `setLoaderOptions`
// drives while the file parses.
export default function useOpenFile({
    promptForOverrides,
    setLoaderOptions
}: {
    promptForOverrides: (path: string) => Promise<CommonFileOverrides | null>;
    setLoaderOptions?: LoaderOptionsSetter;
}): (path: string, overrides?: OpenFileOverrides) => Promise<OpenFileResult> {
    const editorTabs = useEditorTabs();
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);
    const [, setPending] = usePendingOpen();
    // A second open started before the first finishes reads a stale
    // `openFile`, so it wouldn't close the first file and main would hold both
    const inFlight = useRef(false);

    return async function openFileAt(path, overrides) {
        if (inFlight.current) return { status: 'busy' };
        inFlight.current = true;
        try {
            return await open(path, overrides);
        } finally {
            inFlight.current = false;
        }
    };

    async function open(
        path: string,
        overrides?: OpenFileOverrides
    ): Promise<OpenFileResult> {
        // Before anything closes, so the current file stays open. The entry
        // goes first, so the list behind the box is already updated.
        if (!(await window.electronAPI.fs.exists(path))) {
            const recentFiles =
                await window.electronAPI.recentFiles.removeFile(path);
            await window.electronAPI.showMessageBox({
                type: 'error',
                title: 'File not found',
                message:
                    'Could not find the selected file. You may have renamed or deleted it.'
            });
            return { status: 'missing', recentFiles };
        }

        // Common files don't record their year or type, so use the file's
        // remembered choice or ask, as v4 does
        let openOptions = overrides;
        if (!openOptions?.gameYearOverride || !openOptions.gameTypeOverride) {
            let format: string | null;
            try {
                ({ format } =
                    await window.franchiseAPI.getMetadataFromFilePath(path));
            } catch (error) {
                // Locked, unreadable or not a franchise file
                const message =
                    error instanceof Error ? error.message : String(error);
                await showOpenError(path, message);
                return { status: 'error', error: message };
            }
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

        // After the prompts, so the loader never covers the common file modal
        const stopLoader = startLoader(setLoaderOptions);
        try {
            // Release the previous file so two parsed files never coexist in
            // main
            if (openFile) {
                setOpenFile?.(undefined);
                await window.franchiseAPI.closeFile(openFile.fileId);
            }

            const result = await window.franchiseAPI.openFile(
                path,
                openOptions
            );
            if ('error' in result) {
                stopLoader();
                // Main added a schema-missing notification, whose banner
                // offers to pick a schema instead
                if (result.code === 'schema-not-found') {
                    return {
                        status: 'error',
                        error: result.error,
                        code: result.code
                    };
                }
                await showOpenError(path, result.error);
                return {
                    status: 'error',
                    error: result.error,
                    code: result.code
                };
            }

            const [tables, defaultEditor] = await Promise.all([
                window.franchiseAPI.getTableList(result.fileId),
                readDefaultEditor()
            ]);
            const recentFiles =
                await window.electronAPI.recentFiles.addFile(path);
            const file = buildOpenFranchiseFile(
                result.fileId,
                result.metadata,
                tables,
                path
            );
            // In the same tick, so the tab bar renders once, already showing
            // the default editor (v4's navigationService open-file handler)
            setOpenFile?.(file);
            // Whichever file it was waiting for, a schema pick is no longer due
            setPending?.(undefined);
            if (defaultEditor === 'open-table-editor') {
                editorTabs.openTableEditor(file);
            } else if (defaultEditor === 'open-schema-viewer') {
                editorTabs.selectTab(SCHEMA_MANAGEMENT_KEY, file);
            } else if (defaultEditor === 'open-schedule') {
                // Only Madden franchise files have it; others stay on Home
                if (
                    getNavigationItems(file.metadata).some(
                        (item) => item.id === SCHEDULE_KEY
                    )
                ) {
                    editorTabs.selectTab(SCHEDULE_KEY, file);
                }
            }
            // Main sets the title, enables the file menu items and starts
            // watching the file. A restore after a reload or UI switch only
            // sends it if the open was cut off before this
            // (useActiveFranchiseFile).
            window.electronAPI.send('file-loaded', {
                path,
                type: result.metadata.type,
                fileId: result.fileId
            });
            return { status: 'opened', recentFiles };
        } finally {
            stopLoader();
        }
    }
}
