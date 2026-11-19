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
// file-changed and file-missing notifications' banner and drawer links)
export interface ExternalChange {
    // Reopens the file from disk with the same fileId and schema
    reload: (fileId: string) => Promise<void>;
    // Saves to a new path and keeps editing there (v4's Branch and save new)
    branch: (fileId: string) => Promise<void>;
    // Saves to the file's own path, which recreates a missing file
    saveHere: (fileId: string) => Promise<void>;
}

const noop = async (): Promise<void> => {};

export const ExternalChangeContext = createContext<ExternalChange>({
    reload: noop,
    branch: noop,
    saveHere: noop
});

export function useExternalChange(): ExternalChange {
    return useContext(ExternalChangeContext);
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

    const reload = useCallback(
        async (fileId: string): Promise<void> => {
            const { openFile, setOpenFile } = latest.current;
            if (openFile?.fileId !== fileId) return;
            const name = openFile.path ? basename(openFile.path) : 'the file';

            let dirty = true;
            try {
                dirty = await window.franchiseAPI.hasUnsavedChanges(fileId);
            } catch (error) {
                // Prompt anyway
                console.error('Failed to check for unsaved changes', error);
            }
            if (
                dirty &&
                !(await confirm(
                    `Reload ${name}?`,
                    'The file is reopened from disk. Unsaved changes will be lost.',
                    'Reload'
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

    const branch = useCallback(async (fileId: string): Promise<void> => {
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
    const saveHere = useCallback(async (fileId: string): Promise<void> => {
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
        () => ({ reload, branch, saveHere }),
        [reload, branch, saveHere]
    );

    return (
        <ExternalChangeContext.Provider value={value}>
            {children}
            {loader}
        </ExternalChangeContext.Provider>
    );
};
