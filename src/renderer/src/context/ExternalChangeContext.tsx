import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef
} from 'react';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { buildOpenFranchiseFile } from '@renderer/hooks/useActiveFranchiseFile';
import useLoader from '@renderer/hooks/useLoader';
import { confirm } from '@renderer/utils/confirm';
import { basename } from '@renderer/utils/path';

// The actions for a file changed, deleted or moved outside the editor (the
// file-changed and file-missing notifications' bar and drawer links)
export interface ExternalChange {
    // Reopens the file from disk with the same fileId and schema
    load: (fileId: string) => Promise<void>;
    // Keeps the open version; main saves now only with auto-save on and edits
    keep: (fileId: string) => Promise<void>;
    // Saves to a new path and keeps editing there
    copy: (fileId: string) => Promise<void>;
    // Saves to the file's own path, which recreates a missing file
    putBack: (fileId: string) => Promise<void>;
    // Before a manual Save: true when there is no outside change to replace,
    // or the user confirmed replacing it
    confirmSave: (fileId: string) => Promise<boolean>;
}

const noop = async (): Promise<void> => {};

export const ExternalChangeContext = createContext<ExternalChange>({
    load: noop,
    keep: noop,
    copy: noop,
    putBack: noop,
    confirmSave: async () => true
});

export function useExternalChange(): ExternalChange {
    return useContext(ExternalChangeContext);
}

// A settings checkbox is stored as [true] or [] (main's _isPreferenceEnabled)
export function isEnabled(value: unknown): boolean {
    return Array.isArray(value) ? value.includes(true) : Boolean(value);
}

function fileName(path: string | undefined): string {
    return path ? basename(path) : 'the file';
}

// Prompts anyway when the check fails
async function hasUnsavedChanges(fileId: string): Promise<boolean> {
    try {
        return await window.franchiseAPI.hasUnsavedChanges(fileId);
    } catch (error) {
        console.error('Failed to check for unsaved changes', error);
        return true;
    }
}

async function showError(message: string, error: unknown): Promise<void> {
    await window.electronAPI.showMessageBox({
        type: 'error',
        message,
        detail: String(error)
    });
}

interface Props {
    children: ReactNode;
}

export const ExternalChangeProvider: React.FC<Props> = ({
    children
}: Props) => {
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);
    const { loader, setOptions: setLoaderOptions } = useLoader();

    // Read at call time, so the callbacks stay stable
    const latest = useRef({ openFile, setOpenFile });
    useLayoutEffect(() => {
        latest.current = { openFile, setOpenFile };
    });

    const load = useCallback(
        async (fileId: string): Promise<void> => {
            const { openFile, setOpenFile } = latest.current;
            if (openFile?.fileId !== fileId) return;
            const name = fileName(openFile.path);

            if (
                (await hasUnsavedChanges(fileId)) &&
                !(await confirm(
                    `Load the new version of ${name}?`,
                    'Your unsaved edits will be lost.',
                    'Load new version'
                ))
            ) {
                return;
            }

            setLoaderOptions({ message: 'Reloading file...', show: true });
            try {
                const result = await window.franchiseAPI.reloadFile(fileId);
                if ('error' in result) {
                    setLoaderOptions({ show: false });
                    await showError(`Could not reload ${name}.`, result.error);
                    return;
                }
                const tables = await window.franchiseAPI.getTableList(fileId);
                // A new revision keeps the active tab and rebuilds the table tabs
                setOpenFile?.((current) =>
                    current?.fileId === fileId
                        ? buildOpenFranchiseFile(
                              fileId,
                              result.metadata,
                              tables,
                              current.path,
                              current.revision + 1
                          )
                        : current
                );
                setLoaderOptions({ show: false });
            } catch (error) {
                setLoaderOptions({ show: false });
                await showError(`Could not reload ${name}.`, error);
            }
        },
        [setLoaderOptions]
    );

    const keep = useCallback(async (fileId: string): Promise<void> => {
        const { openFile } = latest.current;
        if (openFile?.fileId !== fileId) return;
        const name = fileName(openFile.path);

        // Read now for the text; main decides at confirm time whether to save
        const [autoSave, dirty] = await Promise.all([
            window.electronAPI.preferences.getValue('general.autoSave'),
            hasUnsavedChanges(fileId)
        ]);
        const detail = !isEnabled(autoSave)
            ? 'Nothing is saved now. When you save, the changes made outside the editor will be lost.'
            : dirty
              ? 'Auto-save resumes and saves your edits now. The changes made outside the editor will be lost.'
              : 'Auto-save resumes. Your next edit replaces the changes made outside the editor.';
        if (
            !(await confirm(
                `Keep your version of ${name}?`,
                detail,
                'Keep mine'
            ))
        ) {
            return;
        }

        try {
            const result = await window.franchiseAPI.keepMyVersion(fileId);
            if ('error' in result) {
                await showError(
                    `Could not keep your version of ${name}.`,
                    result.error
                );
            }
        } catch (error) {
            await showError(`Could not keep your version of ${name}.`, error);
        }
    }, []);

    const confirmSave = useCallback(
        async (fileId: string): Promise<boolean> => {
            let changed = true;
            try {
                const list = await window.electronAPI.notifications.list();
                changed = list.some(
                    (n) => n.kind === 'file-changed' && n.fileId === fileId
                );
            } catch (error) {
                // Ask anyway
                console.error('Failed to list notifications', error);
            }
            if (!changed) return true;
            return confirm(
                `Replace ${fileName(latest.current.openFile?.path)} with your version?`,
                'The changes made outside the editor will be lost.',
                'Replace'
            );
        },
        []
    );

    const copy = useCallback(async (fileId: string): Promise<void> => {
        const { openFile, setOpenFile } = latest.current;
        if (openFile?.fileId !== fileId) return;

        const defaultPath = await window.electronAPI.preferences.getValue(
            'general.defaultDirectory'
        );
        const dialog = await window.electronAPI.showSaveDialog({
            title: 'Save as...',
            defaultPath:
                typeof defaultPath === 'string' ? defaultPath : undefined
        });
        if (dialog.canceled || !dialog.filePath) return;

        try {
            const result = await window.franchiseAPI.saveFileAsAndOpen(
                fileId,
                dialog.filePath
            );
            if ('error' in result) {
                await showError('Could not save the file.', result.error);
                return;
            }
            const { path } = result;
            setOpenFile?.((current) =>
                current?.fileId === fileId ? { ...current, path } : current
            );
            await window.electronAPI.recentFiles.addFile(path);
            // Main sets the title and watches the new path
            window.electronAPI.send('file-loaded', {
                path,
                type: openFile.metadata.type,
                fileId
            });
        } catch (error) {
            await showError('Could not save the file.', error);
        }
    }, []);

    // Main removes file-missing once the save lands
    const putBack = useCallback(async (fileId: string): Promise<void> => {
        if (latest.current.openFile?.fileId !== fileId) return;
        try {
            const result = await window.franchiseAPI.saveFile(fileId);
            if ('error' in result) {
                await showError('Could not save the file.', result.error);
            }
        } catch (error) {
            await showError('Could not save the file.', error);
        }
    }, []);

    const value = useMemo(
        () => ({ load, keep, copy, putBack, confirmSave }),
        [load, keep, copy, putBack, confirmSave]
    );

    return (
        <ExternalChangeContext.Provider value={value}>
            {children}
            {loader}
        </ExternalChangeContext.Provider>
    );
};
