import { createElement, ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import {
    EditorTabsContext,
    EditorTabsValue
} from '@renderer/tabs/EditorTabsContext';
import { SCHEMA_MANAGEMENT_KEY } from '@renderer/tabs/editorTabs';
import useOpenFile from './useOpenFile';

const METADATA = { gameYear: 22, format: 'franchise', type: {} };
const PATH = 'C:/saves/CAREER-TEST';
const FTC_PATH = 'C:/saves/franchise-common.FTC';

let storedChoices: unknown;
let defaultEditor: unknown;

const electronAPI = {
    showMessageBox: vi.fn(),
    preferences: { getValue: vi.fn(async () => defaultEditor) },
    recentFiles: { addFile: vi.fn(async () => [{ path: PATH, time: 1 }]) },
    fs: {
        readJson: vi.fn(async () => storedChoices),
        writeJson: vi.fn()
    },
    send: vi.fn()
};
const franchiseAPI = {
    getMetadataFromFilePath: vi.fn(async () => ({ format: 'franchise' })),
    openFile: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({
        fileId: 'file-1',
        metadata: METADATA
    })),
    getTableList: vi.fn(async () => []),
    closeFile: vi.fn()
};

const setOpenFile = vi.fn();
const openTableEditor = vi.fn();
const selectTab = vi.fn();
const promptForOverrides = vi.fn();

// `current`: the file already open
function setup(current?: OpenFranchiseFile) {
    const wrapper = ({ children }: { children: ReactNode }) =>
        createElement(
            FranchiseFileContext.Provider,
            { value: [current, setOpenFile] },
            createElement(
                EditorTabsContext.Provider,
                {
                    value: {
                        openTableEditor,
                        selectTab
                    } as unknown as EditorTabsValue
                },
                children
            )
        );
    return renderHook(() => useOpenFile({ promptForOverrides }), { wrapper })
        .result.current;
}

beforeEach(() => {
    vi.clearAllMocks();
    storedChoices = null;
    defaultEditor = 'open-home';
    franchiseAPI.getMetadataFromFilePath.mockImplementation(async () => ({
        format: 'franchise'
    }));
    Object.assign(window, { electronAPI, franchiseAPI });
});

describe('useOpenFile', () => {
    it('opens the file, records it and sends file-loaded', async () => {
        const result = await setup()(PATH);

        expect(result).toEqual({
            status: 'opened',
            recentFiles: [{ path: PATH, time: 1 }]
        });
        expect(franchiseAPI.openFile).toHaveBeenCalledWith(PATH, undefined);
        expect(electronAPI.recentFiles.addFile).toHaveBeenCalledWith(PATH);
        expect(setOpenFile).toHaveBeenCalledWith(
            expect.objectContaining({ fileId: 'file-1', path: PATH })
        );
        expect(electronAPI.send).toHaveBeenCalledWith('file-loaded', {
            path: PATH,
            type: METADATA.type,
            fileId: 'file-1'
        });
    });

    it('closes the previous file first', async () => {
        await setup({ fileId: 'old' } as OpenFranchiseFile)(PATH);

        expect(setOpenFile.mock.calls[0]).toEqual([undefined]);
        expect(franchiseAPI.closeFile).toHaveBeenCalledWith('old');
    });

    it('shows a message box and returns the error code on an error', async () => {
        franchiseAPI.openFile.mockResolvedValueOnce({
            error: 'No schema',
            code: 'schema-not-found'
        } as never);

        const result = await setup()(PATH);

        expect(result).toEqual({
            status: 'error',
            error: 'No schema',
            code: 'schema-not-found'
        });
        expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'error',
                message: 'Could not open CAREER-TEST.',
                detail: 'No schema'
            })
        );
        expect(electronAPI.send).not.toHaveBeenCalled();
    });

    describe('common files', () => {
        beforeEach(() => {
            franchiseAPI.getMetadataFromFilePath.mockImplementation(
                async () => ({ format: 'franchise-common' })
            );
        });

        it('prompts and opens with the chosen year and type', async () => {
            promptForOverrides.mockResolvedValue({
                gameYearOverride: 24,
                gameTypeOverride: 'madden'
            });

            await setup()(FTC_PATH);

            expect(promptForOverrides).toHaveBeenCalledWith(FTC_PATH);
            expect(franchiseAPI.openFile).toHaveBeenCalledWith(FTC_PATH, {
                gameYearOverride: 24,
                gameTypeOverride: 'madden'
            });
        });

        it('uses the remembered choice without prompting', async () => {
            storedChoices = {
                [FTC_PATH]: { gameYear: 23, gameType: 'madden' }
            };

            await setup()(FTC_PATH);

            expect(promptForOverrides).not.toHaveBeenCalled();
            expect(franchiseAPI.openFile).toHaveBeenCalledWith(FTC_PATH, {
                gameYearOverride: 23,
                gameTypeOverride: 'madden'
            });
        });

        it('keeps the current file when the prompt is cancelled', async () => {
            promptForOverrides.mockResolvedValue(null);

            const result = await setup({ fileId: 'old' } as OpenFranchiseFile)(
                FTC_PATH
            );

            expect(result).toEqual({ status: 'cancelled' });
            expect(franchiseAPI.closeFile).not.toHaveBeenCalled();
            expect(franchiseAPI.openFile).not.toHaveBeenCalled();
        });

        it('still prompts when only a schemaOverride is given', async () => {
            promptForOverrides.mockResolvedValue({
                gameYearOverride: 24,
                gameTypeOverride: 'madden'
            });

            await setup()(FTC_PATH, { schemaOverride: { path: 'a.gz' } });

            expect(promptForOverrides).toHaveBeenCalled();
            expect(franchiseAPI.openFile).toHaveBeenCalledWith(FTC_PATH, {
                gameYearOverride: 24,
                gameTypeOverride: 'madden',
                schemaOverride: { path: 'a.gz' }
            });
        });

        it('keeps a given year over the remembered one', async () => {
            storedChoices = {
                [FTC_PATH]: { gameYear: 23, gameType: 'madden' }
            };

            await setup()(FTC_PATH, { gameYearOverride: 26 });

            expect(franchiseAPI.openFile).toHaveBeenCalledWith(FTC_PATH, {
                gameYearOverride: 26,
                gameTypeOverride: 'madden'
            });
        });

        it('skips the check when year and type are given', async () => {
            const overrides = {
                gameYearOverride: 22,
                gameTypeOverride: 'madden'
            };

            await setup()(FTC_PATH, overrides);

            expect(franchiseAPI.getMetadataFromFilePath).not.toHaveBeenCalled();
            expect(franchiseAPI.openFile).toHaveBeenCalledWith(
                FTC_PATH,
                overrides
            );
        });
    });

    it('passes schemaOverride through for a franchise file', async () => {
        await setup()(PATH, { schemaOverride: { path: 'a.gz' } });

        expect(franchiseAPI.openFile).toHaveBeenCalledWith(PATH, {
            schemaOverride: { path: 'a.gz' }
        });
    });

    describe('default editor', () => {
        it('opens the table editor', async () => {
            defaultEditor = 'open-table-editor';
            await setup()(PATH);
            expect(openTableEditor).toHaveBeenCalledWith(
                expect.objectContaining({ fileId: 'file-1' })
            );
        });

        it('selects the schema viewer tab', async () => {
            defaultEditor = 'open-schema-viewer';
            await setup()(PATH);
            expect(selectTab).toHaveBeenCalledWith(
                SCHEMA_MANAGEMENT_KEY,
                expect.objectContaining({ fileId: 'file-1' })
            );
        });

        it('stays on Home', async () => {
            await setup()(PATH);
            expect(openTableEditor).not.toHaveBeenCalled();
            expect(selectTab).not.toHaveBeenCalled();
        });

        it('stays on Home when the preference read fails', async () => {
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            electronAPI.preferences.getValue.mockRejectedValueOnce(
                new Error('boom')
            );
            const result = await setup()(PATH);
            expect(result.status).toBe('opened');
            expect(openTableEditor).not.toHaveBeenCalled();
        });
    });
});
