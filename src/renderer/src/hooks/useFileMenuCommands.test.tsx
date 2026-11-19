import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import useFileMenuCommands from './useFileMenuCommands';

const navigate = vi.fn();
vi.mock('react-router-dom', async () => ({
    ...(await vi.importActual<typeof import('react-router-dom')>(
        'react-router-dom'
    )),
    useNavigate: () => navigate
}));

function makeFile(fileId: string): OpenFranchiseFile {
    return { fileId, metadata: {}, tables: [] } as unknown as OpenFranchiseFile;
}

const listeners: Record<string, () => void> = {};
const calls: string[] = [];
const setOpenFile = vi.fn();

const electronAPI = {
    on: vi.fn(),
    send: vi.fn(),
    removeAllListeners: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
    preferences: { getValue: vi.fn() }
};
const franchiseAPI = {
    saveFile: vi.fn(),
    saveFileAs: vi.fn(),
    closeFile: vi.fn()
};

// `current` is read at render time, so tests can swap the open file
function setup(current: { file: OpenFranchiseFile | undefined }) {
    return renderHook(() => useFileMenuCommands(), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <MemoryRouter>
                <FranchiseFileContext.Provider
                    value={[current.file, setOpenFile]}
                >
                    {children}
                </FranchiseFileContext.Provider>
            </MemoryRouter>
        )
    });
}

// Fire a menu event and let the async handler finish
const fire = (channel: string) =>
    act(async () => {
        listeners[channel]();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    electronAPI.on.mockImplementation((channel: string, cb: () => void) => {
        listeners[channel] = cb;
    });
    electronAPI.send.mockImplementation((channel: string) => {
        calls.push(`send:${channel}`);
    });
    electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
    electronAPI.preferences.getValue.mockResolvedValue('C:\\saves');
    electronAPI.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: 'C:\\saves\\new'
    });
    franchiseAPI.saveFile.mockResolvedValue({ success: true });
    franchiseAPI.saveFileAs.mockResolvedValue({ success: true });
    franchiseAPI.closeFile.mockImplementation(async () => {
        calls.push('closeFile');
        return true;
    });
    setOpenFile.mockImplementation(() => calls.push('setOpenFile'));
    navigate.mockImplementation(() => calls.push('navigate'));
    Object.assign(window, { electronAPI, franchiseAPI });
});

describe('useFileMenuCommands', () => {
    it('registers the three channels', () => {
        setup({ file: makeFile('f1') });
        expect(electronAPI.on.mock.calls.map((c) => c[0])).toEqual([
            'save-file',
            'save-file-as',
            'close-file'
        ]);
    });

    it('save-file saves the open file', async () => {
        setup({ file: makeFile('f1') });
        await fire('save-file');
        expect(franchiseAPI.saveFile).toHaveBeenCalledWith('f1');
        expect(electronAPI.showMessageBox).not.toHaveBeenCalled();
    });

    it('save-file shows an error box on an error result', async () => {
        franchiseAPI.saveFile.mockResolvedValue({ error: 'disk full' });
        setup({ file: makeFile('f1') });
        await fire('save-file');
        expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error', detail: 'disk full' })
        );
    });

    it('save-file-as asks for a path then saves there', async () => {
        setup({ file: makeFile('f1') });
        await fire('save-file-as');
        expect(electronAPI.preferences.getValue).toHaveBeenCalledWith(
            'general.defaultDirectory'
        );
        expect(electronAPI.showSaveDialog).toHaveBeenCalledWith({
            title: 'Save as...',
            defaultPath: 'C:\\saves'
        });
        expect(franchiseAPI.saveFileAs).toHaveBeenCalledWith(
            'f1',
            'C:\\saves\\new'
        );
    });

    it('save-file-as ignores a non-string default directory', async () => {
        electronAPI.preferences.getValue.mockResolvedValue(undefined);
        setup({ file: makeFile('f1') });
        await fire('save-file-as');
        expect(electronAPI.showSaveDialog).toHaveBeenCalledWith({
            title: 'Save as...',
            defaultPath: undefined
        });
    });

    it('save-file-as does nothing when the dialog is cancelled', async () => {
        electronAPI.showSaveDialog.mockResolvedValue({ canceled: true });
        setup({ file: makeFile('f1') });
        await fire('save-file-as');
        expect(franchiseAPI.saveFileAs).not.toHaveBeenCalled();
    });

    it('save-file-as shows an error box on an error result', async () => {
        franchiseAPI.saveFileAs.mockResolvedValue({ error: 'denied' });
        setup({ file: makeFile('f1') });
        await fire('save-file-as');
        expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'error', detail: 'denied' })
        );
    });

    it('does nothing without an open file', async () => {
        setup({ file: undefined });
        await fire('save-file');
        await fire('save-file-as');
        await fire('close-file');
        expect(franchiseAPI.saveFile).not.toHaveBeenCalled();
        expect(electronAPI.showSaveDialog).not.toHaveBeenCalled();
        expect(franchiseAPI.saveFileAs).not.toHaveBeenCalled();
        expect(franchiseAPI.closeFile).not.toHaveBeenCalled();
        expect(setOpenFile).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
        expect(electronAPI.send).not.toHaveBeenCalled();
    });

    it('close-file closes, clears, navigates home, then tells main', async () => {
        setup({ file: makeFile('f1') });
        await fire('close-file');
        expect(franchiseAPI.closeFile).toHaveBeenCalledWith('f1');
        expect(setOpenFile).toHaveBeenCalledWith(undefined);
        expect(navigate).toHaveBeenCalledWith('/');
        expect(electronAPI.send).toHaveBeenCalledWith('close-file');
        expect(calls).toEqual([
            'closeFile',
            'setOpenFile',
            'navigate',
            'send:close-file'
        ]);
    });

    it('removes the listeners on unmount', () => {
        const { unmount } = setup({ file: makeFile('f1') });
        expect(electronAPI.removeAllListeners).not.toHaveBeenCalled();
        unmount();
        expect(
            electronAPI.removeAllListeners.mock.calls.map((c) => c[0])
        ).toEqual(['save-file', 'save-file-as', 'close-file']);
    });

    it('registers once and uses the latest file after a re-render', async () => {
        const current = {
            file: makeFile('f1') as OpenFranchiseFile | undefined
        };
        const { rerender } = setup(current);
        current.file = makeFile('f2');
        rerender();

        expect(electronAPI.on).toHaveBeenCalledTimes(3);
        expect(electronAPI.removeAllListeners).not.toHaveBeenCalled();
        await fire('save-file');
        expect(franchiseAPI.saveFile).toHaveBeenCalledWith('f2');
    });
});
