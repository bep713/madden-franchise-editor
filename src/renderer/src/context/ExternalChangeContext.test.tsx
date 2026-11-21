import { useLayoutEffect, useState } from 'react';
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
    recentFiles: { addFile: vi.fn() },
    notifications: { list: vi.fn() }
};
const franchiseAPI = {
    hasUnsavedChanges: vi.fn(),
    reloadFile: vi.fn(),
    getTableList: vi.fn(),
    saveFileAsAndOpen: vi.fn(),
    saveFile: vi.fn(),
    keepMyVersion: vi.fn()
};

let autoSave: unknown;

let actions: ExternalChange;
let current: OpenFranchiseFile | undefined;

// Captured in a layout effect, which runs before render() returns
const Probe: React.FC = () => {
    const value = useExternalChange();
    useLayoutEffect(() => {
        actions = value;
    });
    return null;
};

// A real state, so the tests see what the provider sets
const Harness: React.FC = () => {
    const [file, setFile] = useState<OpenFranchiseFile | undefined>(makeFile);
    useLayoutEffect(() => {
        current = file;
    });
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
    autoSave = [];
    electronAPI.preferences.getValue.mockImplementation(async (key) =>
        key === 'general.autoSave' ? autoSave : 'C:\\saves'
    );
    electronAPI.notifications.list.mockResolvedValue([]);
    franchiseAPI.keepMyVersion.mockResolvedValue({ saved: false });
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
    franchiseAPI.saveFile.mockResolvedValue({ path: PATH });
    render(<Harness />);
});

describe('load', () => {
    it('loads without asking when there are no unsaved changes', async () => {
        await run(() => actions.load(FILE_ID));
        expect(confirmBoxes()).toHaveLength(0);
        expect(franchiseAPI.reloadFile).toHaveBeenCalledWith(FILE_ID);
        expect(current?.fileId).toBe(FILE_ID);
        expect(current?.revision).toBe(3);
        expect(current?.path).toBe(PATH);
        expect(current?.tables).toEqual([{ name: 'Player', index: 0 }]);
    });

    it('confirms first when the file has unsaved changes', async () => {
        franchiseAPI.hasUnsavedChanges.mockResolvedValue(true);
        await run(() => actions.load(FILE_ID));
        expect(confirmBoxes()).toHaveLength(1);
        expect(confirmBoxes()[0][0]).toMatchObject({
            message: 'Load the new version of CAREER-TEST?',
            detail: 'Your unsaved edits will be lost.',
            buttons: ['Load new version', 'Cancel']
        });
        expect(franchiseAPI.reloadFile).toHaveBeenCalled();
    });

    it('confirms when the unsaved check fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        franchiseAPI.hasUnsavedChanges.mockRejectedValue(new Error('boom'));
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await run(() => actions.load(FILE_ID));
        expect(confirmBoxes()).toHaveLength(1);
        expect(franchiseAPI.reloadFile).not.toHaveBeenCalled();
    });

    it('does nothing when the confirm is cancelled', async () => {
        franchiseAPI.hasUnsavedChanges.mockResolvedValue(true);
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await run(() => actions.load(FILE_ID));
        expect(franchiseAPI.reloadFile).not.toHaveBeenCalled();
        expect(current?.revision).toBe(2);
    });

    it('shows an error and keeps the file on failure', async () => {
        franchiseAPI.reloadFile.mockResolvedValue({ error: 'locked' });
        await run(() => actions.load(FILE_ID));
        expect(errorBoxes()).toHaveLength(1);
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not reload CAREER-TEST.',
            detail: 'locked'
        });
        expect(franchiseAPI.getTableList).not.toHaveBeenCalled();
        expect(current?.revision).toBe(2);
    });

    it('ignores a fileId that is not the open file', async () => {
        await run(() => actions.load('other'));
        expect(franchiseAPI.hasUnsavedChanges).not.toHaveBeenCalled();
        expect(franchiseAPI.reloadFile).not.toHaveBeenCalled();
    });
});

describe('copy', () => {
    it('does nothing when the dialog is cancelled', async () => {
        electronAPI.showSaveDialog.mockResolvedValue({ canceled: true });
        await run(() => actions.copy(FILE_ID));
        expect(franchiseAPI.saveFileAsAndOpen).not.toHaveBeenCalled();
        expect(electronAPI.send).not.toHaveBeenCalled();
        expect(current?.path).toBe(PATH);
    });

    it('saves to the new path and keeps editing there', async () => {
        await run(() => actions.copy(FILE_ID));
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
        await run(() => actions.copy(FILE_ID));
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not save the file.',
            detail: 'denied'
        });
        expect(current?.path).toBe(PATH);
        expect(electronAPI.send).not.toHaveBeenCalled();
        expect(electronAPI.recentFiles.addFile).not.toHaveBeenCalled();
    });

    it('ignores a fileId that is not the open file', async () => {
        await run(() => actions.copy('other'));
        expect(electronAPI.showSaveDialog).not.toHaveBeenCalled();
    });
});

describe('putBack', () => {
    it('saves the open file to its own path', async () => {
        await run(() => actions.putBack(FILE_ID));
        expect(franchiseAPI.saveFile).toHaveBeenCalledExactlyOnceWith(FILE_ID);
        expect(errorBoxes()).toHaveLength(0);
        expect(current?.path).toBe(PATH);
    });

    it('shows the save error', async () => {
        franchiseAPI.saveFile.mockResolvedValue({ error: 'no folder' });
        await run(() => actions.putBack(FILE_ID));
        expect(errorBoxes()).toHaveLength(1);
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not save the file.',
            detail: 'no folder'
        });
    });

    it('shows an error when the save throws', async () => {
        franchiseAPI.saveFile.mockRejectedValue(new Error('boom'));
        await run(() => actions.putBack(FILE_ID));
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not save the file.',
            detail: 'Error: boom'
        });
    });

    it('ignores a fileId that is not the open file', async () => {
        await run(() => actions.putBack('other'));
        expect(franchiseAPI.saveFile).not.toHaveBeenCalled();
    });
});

describe('keep', () => {
    const AUTO_SAVE_OFF =
        'Nothing is saved now. When you save, the changes made outside the editor will be lost.';
    const ON_WITH_EDITS =
        'Auto-save resumes and saves your edits now. The changes made outside the editor will be lost.';
    const ON_NO_EDITS =
        'Auto-save resumes. Your next edit replaces the changes made outside the editor.';

    it.each([
        ['off, with edits', [], true, AUTO_SAVE_OFF],
        ['off, no edits', [], false, AUTO_SAVE_OFF],
        ['on, with edits', [true], true, ON_WITH_EDITS],
        ['on, no edits', [true], false, ON_NO_EDITS]
    ])(
        'confirms with the auto-save %s text, then keeps',
        async (_, pref, dirty, detail) => {
            autoSave = pref;
            franchiseAPI.hasUnsavedChanges.mockResolvedValue(dirty);
            await run(() => actions.keep(FILE_ID));
            expect(confirmBoxes()).toHaveLength(1);
            expect(confirmBoxes()[0][0]).toMatchObject({
                message: 'Keep your version of CAREER-TEST?',
                detail,
                buttons: ['Keep mine', 'Cancel'],
                cancelId: 1
            });
            expect(franchiseAPI.keepMyVersion).toHaveBeenCalledExactlyOnceWith(
                FILE_ID
            );
        }
    );

    it('does nothing when the confirm is cancelled', async () => {
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await run(() => actions.keep(FILE_ID));
        expect(franchiseAPI.keepMyVersion).not.toHaveBeenCalled();
    });

    it('shows the error', async () => {
        franchiseAPI.keepMyVersion.mockResolvedValue({ error: 'locked' });
        await run(() => actions.keep(FILE_ID));
        expect(errorBoxes()[0][0]).toMatchObject({
            message: 'Could not keep your version of CAREER-TEST.',
            detail: 'locked'
        });
    });

    it('ignores a fileId that is not the open file', async () => {
        await run(() => actions.keep('other'));
        expect(confirmBoxes()).toHaveLength(0);
        expect(franchiseAPI.keepMyVersion).not.toHaveBeenCalled();
    });
});

describe('confirmSave', () => {
    const changed = (fileId: string) => ({
        id: 'n1',
        kind: 'file-changed',
        fileId,
        data: { path: PATH }
    });

    async function confirmSave(): Promise<boolean> {
        let result = false;
        await run(async () => {
            result = await actions.confirmSave(FILE_ID);
        });
        return result;
    }

    it('is true without asking when the file has no file-changed', async () => {
        electronAPI.notifications.list.mockResolvedValue([
            changed('other'),
            { ...changed(FILE_ID), kind: 'file-missing' }
        ]);
        expect(await confirmSave()).toBe(true);
        expect(confirmBoxes()).toHaveLength(0);
    });

    it('asks with a stored file-changed, and again after Cancel', async () => {
        electronAPI.notifications.list.mockResolvedValue([changed(FILE_ID)]);
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        expect(await confirmSave()).toBe(false);
        expect(await confirmSave()).toBe(false);
        expect(confirmBoxes()).toHaveLength(2);
        expect(confirmBoxes()[0][0]).toMatchObject({
            message: 'Replace CAREER-TEST with your version?',
            detail: 'The changes made outside the editor will be lost.',
            buttons: ['Replace', 'Cancel']
        });

        electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
        expect(await confirmSave()).toBe(true);
    });

    it('asks when the list fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        electronAPI.notifications.list.mockRejectedValue(new Error('boom'));
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        expect(await confirmSave()).toBe(false);
        expect(confirmBoxes()).toHaveLength(1);
    });
});
