import { useState } from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import {
    type ExternalChange,
    ExternalChangeProvider,
    useExternalChange
} from './ExternalChangeContext';

const FILE_ID = 'file-1';
const PATH = 'C:\\saves\\CAREER-TEST';
const NEW_PATH = 'C:\\saves\\CAREER-BRANCH';
const TYPE = { gameType: 'madden' };

function makeFile(): OpenFranchiseFile {
    return {
        fileId: FILE_ID,
        path: PATH,
        metadata: { gameYear: 22, type: TYPE },
        tables: [],
        revision: 2
    } as unknown as OpenFranchiseFile;
}

const electronAPI = {
    send: vi.fn(),
    showSaveDialog: vi.fn(),
    showMessageBox: vi.fn(),
    preferences: { getValue: vi.fn() },
    recentFiles: { addFile: vi.fn() }
};
const franchiseAPI = {
    hasUnsavedChanges: vi.fn(),
    reloadFile: vi.fn(),
    getTableList: vi.fn(),
    saveFileAsAndOpen: vi.fn()
};

let actions: ExternalChange;
let current: OpenFranchiseFile | undefined;

const Probe: React.FC = () => {
    actions = useExternalChange();
    return null;
};

// A real state, so the tests see what the provider sets
const Harness: React.FC = () => {
    const [file, setFile] = useState<OpenFranchiseFile | undefined>(makeFile);
    current = file;
    return (
        <FranchiseFileContext.Provider value={[file, setFile]}>
            <ExternalChangeProvider>
                <Probe />
            </ExternalChangeProvider>
        </FranchiseFileContext.Provider>
    );
};

const run = (fn: () => Promise<void>) =>
    act(async () => {
        await fn();
    });

// Message boxes other than the confirm (warning) one
const errorBoxes = () =>
    electronAPI.showMessageBox.mock.calls.filter(
        ([options]) => options.type === 'error'
    );
const confirmBoxes = () =>
    electronAPI.showMessageBox.mock.calls.filter(
        ([options]) => options.type === 'warning'
    );

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { electronAPI, franchiseAPI });
    electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
    electronAPI.preferences.getValue.mockResolvedValue('C:\\saves');
    electronAPI.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: NEW_PATH
    });
    electronAPI.recentFiles.addFile.mockResolvedValue([]);
    franchiseAPI.hasUnsavedChanges.mockResolvedValue(false);
    franchiseAPI.reloadFile.mockResolvedValue({
        fileId: FILE_ID,
        metadata: { gameYear: 22, type: TYPE }
    });
    franchiseAPI.getTableList.mockResolvedValue([{ name: 'Player' }]);
    franchiseAPI.saveFileAsAndOpen.mockResolvedValue({ path: NEW_PATH });
    render(<Harness />);
});

describe('reload', () => {
    it('reloads without asking when there are no unsaved changes', async () => {
        await run(() => actions.reload(FILE_ID));
        expect(confirmBoxes()).toHaveLength(0);
        expect(franchiseAPI.reloadFile).toHaveBeenCalledWith(FILE_ID);
        expect(current?.fileId).toBe(FILE_ID);
        expect(current?.revision).toBe(3);
        expect(current?.path).toBe(PATH);
        expect(current?.tables).toEqual([{ name: 'Player', index: 0 }]);
    });

    it('confirms first when the file has unsaved changes', async () => {
        franchiseAPI.hasUnsavedChanges.mockResolvedValue(true);
        await run(() => actions.reload(FILE_ID));
        expect(confirmBoxes()).toHaveLength(1);
        expect(confirmBoxes()[0][0]).toMatchObject({
            message: 'Reload CAREER-TEST?',
            detail: 'The file is reopened from disk. Unsaved changes will be lost.',
            buttons: ['Reload', 'Cancel']
        });
        expect(franchiseAPI.reloadFile).toHaveBeenCalled();
    });

    it('confirms when the unsaved check fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        franchiseAPI.hasUnsavedChanges.mockRejectedValue(new Error('boom'));
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await run(() => actions.reload(FILE_ID));
        expect(confirmBoxes()).toHaveLength(1);
        expect(franchiseAPI.reloadFile).not.toHaveBeenCalled();
    });

    it('does nothing when the confirm is cancelled', async () => {
        franchiseAPI.hasUnsavedChanges.mockResolvedValue(true);
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await run(() => actions.reload(FILE_ID));
        expect(franchiseAPI.reloadFile).not.toHaveBeenCalled();
        expect(current?.revision).toBe(2);
    });

    it('shows an error and keeps the file on failure', async () => {
        franchiseAPI.reloadFile.mockResolvedValue({ error: 'locked' });
        await run(() => actions.reload(FILE_ID));
        expect(errorBoxes()).toHaveLength(1);
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not reload CAREER-TEST.',
            detail: 'locked'
        });
        expect(franchiseAPI.getTableList).not.toHaveBeenCalled();
        expect(current?.revision).toBe(2);
    });

    it('ignores a fileId that is not the open file', async () => {
        await run(() => actions.reload('other'));
        expect(franchiseAPI.hasUnsavedChanges).not.toHaveBeenCalled();
        expect(franchiseAPI.reloadFile).not.toHaveBeenCalled();
    });
});

describe('branch', () => {
    it('does nothing when the dialog is cancelled', async () => {
        electronAPI.showSaveDialog.mockResolvedValue({ canceled: true });
        await run(() => actions.branch(FILE_ID));
        expect(franchiseAPI.saveFileAsAndOpen).not.toHaveBeenCalled();
        expect(electronAPI.send).not.toHaveBeenCalled();
        expect(current?.path).toBe(PATH);
    });

    it('saves to the new path and keeps editing there', async () => {
        await run(() => actions.branch(FILE_ID));
        expect(electronAPI.showSaveDialog).toHaveBeenCalledWith({
            title: 'Save as...',
            defaultPath: 'C:\\saves'
        });
        expect(franchiseAPI.saveFileAsAndOpen).toHaveBeenCalledWith(
            FILE_ID,
            NEW_PATH
        );
        expect(current?.path).toBe(NEW_PATH);
        expect(current?.revision).toBe(2);
        expect(electronAPI.recentFiles.addFile).toHaveBeenCalledWith(NEW_PATH);
        expect(electronAPI.send).toHaveBeenCalledWith('file-loaded', {
            path: NEW_PATH,
            type: TYPE,
            fileId: FILE_ID
        });
    });

    it('shows the save error and keeps the path on failure', async () => {
        franchiseAPI.saveFileAsAndOpen.mockResolvedValue({ error: 'denied' });
        await run(() => actions.branch(FILE_ID));
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not save the file.',
            detail: 'denied'
        });
        expect(current?.path).toBe(PATH);
        expect(electronAPI.send).not.toHaveBeenCalled();
        expect(electronAPI.recentFiles.addFile).not.toHaveBeenCalled();
    });

    it('ignores a fileId that is not the open file', async () => {
        await run(() => actions.branch('other'));
        expect(electronAPI.showSaveDialog).not.toHaveBeenCalled();
    });
});
