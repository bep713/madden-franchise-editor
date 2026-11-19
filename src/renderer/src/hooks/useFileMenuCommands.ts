import { useContext, useEffect, useLayoutEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
import { SaveFileResult } from '@shared/types';

const CHANNELS = ['save-file', 'save-file-as', 'close-file'] as const;

async function showSaveError(result: SaveFileResult): Promise<void> {
    if ('error' in result) {
        await window.electronAPI.showMessageBox({
            type: 'error',
            message: 'Could not save the file.',
            detail: result.error
        });
    }
}

// The app menu's Save (Ctrl+S), Save As (Ctrl+Shift+S) and Close File
// (Ctrl+Shift+X), as in v4's navigationService addIpcListeners.
export default function useFileMenuCommands(): void {
    const [openFile, setOpenFile] = useContext(FranchiseFileContext);
    const navigate = useNavigate();

    // Read at event time, so the listeners are only added once
    const latest = useRef({ openFile, setOpenFile, navigate });
    useLayoutEffect(() => {
        latest.current = { openFile, setOpenFile, navigate };
    });

    useEffect(() => {
        const handlers: Record<(typeof CHANNELS)[number], () => Promise<void>> =
            {
                'save-file': async () => {
                    const fileId = latest.current.openFile?.fileId;
                    if (fileId) {
                        await showSaveError(
                            await window.franchiseAPI.saveFile(fileId)
                        );
                    }
                },
                'save-file-as': async () => {
                    const fileId = latest.current.openFile?.fileId;
                    if (!fileId) {
                        return;
                    }
                    const defaultPath =
                        await window.electronAPI.preferences.getValue(
                            'general.defaultDirectory'
                        );
                    const result = await window.electronAPI.showSaveDialog({
                        title: 'Save as...',
                        defaultPath:
                            typeof defaultPath === 'string'
                                ? defaultPath
                                : undefined
                    });
                    if (!result.canceled && result.filePath) {
                        // The open file stays at its old path, as in v4
                        await showSaveError(
                            await window.franchiseAPI.saveFileAs(
                                fileId,
                                result.filePath
                            )
                        );
                    }
                },
                'close-file': async () => {
                    const { openFile, setOpenFile, navigate } = latest.current;
                    if (!openFile) {
                        return;
                    }
                    await window.franchiseAPI.closeFile(openFile.fileId);
                    setOpenFile?.(undefined);
                    navigate('/');
                    // Main resets the title and the menu, and stops watching
                    window.electronAPI.send('close-file');
                }
            };

        for (const channel of CHANNELS) {
            window.electronAPI.on(channel, () => void handlers[channel]());
        }
        return () => {
            // The preload has no per-callback removal; only React listens
            // on these channels in this window.
            for (const channel of CHANNELS) {
                window.electronAPI.removeAllListeners(channel);
            }
        };
    }, []);
}
