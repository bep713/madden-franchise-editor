import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import {
    EditorTabsContext,
    EditorTabsValue
} from '@renderer/tabs/EditorTabsContext';
import Welcome from './Welcome';

// Allotment measures its panes, which jsdom can't
vi.mock('allotment', () => {
    const Pane = ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
    );
    return { Allotment: Object.assign(Pane, { Pane }) };
});

const METADATA = { gameYear: 22, format: 'franchise', type: {} };

const electronAPI = {
    getVersion: vi.fn(async () => '5.0.0'),
    files: { getSaves: vi.fn(async () => ({ success: false })) },
    recentFiles: {
        initialize: vi.fn(async () => undefined),
        getRecentFiles: vi.fn(async () => []),
        addFile: vi.fn(async () => [])
    },
    showOpenDialog: vi.fn(async () => ({
        canceled: false,
        filePaths: ['C:/saves/CAREER-TEST']
    })),
    showMessageBox: vi.fn(),
    preferences: { getValue: vi.fn(), set: vi.fn(async () => undefined) },
    send: vi.fn()
};
const franchiseAPI = {
    getMetadataFromFilePath: vi.fn(async () => ({ format: 'franchise' })),
    openFile: vi.fn(async () => ({ fileId: 'file-1', metadata: METADATA })),
    getTableList: vi.fn(async () => []),
    closeFile: vi.fn()
};

const setOpenFile = vi.fn();
const openTableEditor = vi.fn();

// `current`: the file already open
function setup(current?: OpenFranchiseFile) {
    render(
        <MemoryRouter>
            <FranchiseFileContext.Provider value={[current, setOpenFile]}>
                <EditorTabsContext.Provider
                    value={{ openTableEditor } as unknown as EditorTabsValue}
                >
                    <Welcome />
                </EditorTabsContext.Provider>
            </FranchiseFileContext.Provider>
        </MemoryRouter>
    );
}

async function clickOpenFile(): Promise<void> {
    // The side nav has its own "Open a file..." link
    await userEvent.click(
        within(screen.getByTestId('get-started-card')).getByText(
            'Open a file...'
        )
    );
}

async function openFile(): Promise<void> {
    await clickOpenFile();
    await waitFor(() => expect(electronAPI.send).toHaveBeenCalled());
}

describe('Welcome default editor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
    });

    it('opens the table editor for the new file with open-table-editor', async () => {
        electronAPI.preferences.getValue.mockResolvedValue('open-table-editor');
        setup();
        await openFile();

        expect(electronAPI.preferences.getValue).toHaveBeenCalledWith(
            'general.defaultEditor'
        );
        expect(openTableEditor).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ fileId: 'file-1' })
        );
        // Opened in the same tick as the file, after it
        expect(setOpenFile.mock.invocationCallOrder[0]).toBeLessThan(
            openTableEditor.mock.invocationCallOrder[0]
        );
    });

    it.each(['open-home', 'open-schedule', 'open-schema-viewer', undefined])(
        'stays Home with %s',
        async (value) => {
            electronAPI.preferences.getValue.mockResolvedValue(value);
            setup();
            await openFile();
            expect(setOpenFile).toHaveBeenCalled();
            expect(openTableEditor).not.toHaveBeenCalled();
        }
    );

    it('stays Home when the preference read fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        electronAPI.preferences.getValue.mockRejectedValue(new Error('nope'));
        setup();
        await openFile();
        expect(setOpenFile).toHaveBeenCalled();
        expect(openTableEditor).not.toHaveBeenCalled();
    });
});

describe('Welcome common files', () => {
    const FTC_PREFS: Record<string, string> = {
        'general.ftcGameYearOverride': '22',
        'general.ftcGameTypeOverride': 'madden'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
        electronAPI.preferences.getValue.mockImplementation(
            async (key: string) => FTC_PREFS[key]
        );
        franchiseAPI.getMetadataFromFilePath.mockResolvedValue({
            format: 'franchise-common'
        });
    });

    it('opens a franchise file without asking', async () => {
        franchiseAPI.getMetadataFromFilePath.mockResolvedValue({
            format: 'franchise'
        });
        setup();
        await openFile();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(franchiseAPI.openFile).toHaveBeenCalledExactlyOnceWith(
            'C:/saves/CAREER-TEST',
            undefined
        );
    });

    it('asks for the year and type and passes them to openFile', async () => {
        setup();
        await clickOpenFile();
        const dialog = await screen.findByRole('dialog', {
            name: 'Set File Parameters'
        });
        // the saved defaults are preselected
        expect(within(dialog).getByLabelText('Game Year')).toHaveValue('22');
        expect(franchiseAPI.openFile).not.toHaveBeenCalled();

        await userEvent.selectOptions(
            within(dialog).getByLabelText('Game Year'),
            '27'
        );
        await userEvent.selectOptions(
            within(dialog).getByLabelText('Game Type'),
            'college'
        );
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Confirm' })
        );

        await waitFor(() => expect(electronAPI.send).toHaveBeenCalled());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(franchiseAPI.openFile).toHaveBeenCalledExactlyOnceWith(
            'C:/saves/CAREER-TEST',
            { gameYearOverride: 27, gameTypeOverride: 'college' }
        );
        expect(electronAPI.preferences.set).not.toHaveBeenCalled();
    });

    it('saves the choices as strings with the default box ticked', async () => {
        setup();
        await clickOpenFile();
        const dialog = await screen.findByRole('dialog');
        await userEvent.selectOptions(
            within(dialog).getByLabelText('Game Year'),
            '27'
        );
        await userEvent.click(
            within(dialog).getByLabelText('Make these my default choices')
        );
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Confirm' })
        );
        await waitFor(() => expect(electronAPI.send).toHaveBeenCalled());
        expect(electronAPI.preferences.set).toHaveBeenCalledExactlyOnceWith({
            general: {
                ftcGameYearOverride: '27',
                ftcGameTypeOverride: 'madden'
            }
        });
    });

    it('falls back to the schema defaults when nothing is saved', async () => {
        electronAPI.preferences.getValue.mockResolvedValue(undefined);
        setup();
        await clickOpenFile();
        const dialog = await screen.findByRole('dialog');
        expect(within(dialog).getByLabelText('Game Year')).toHaveValue('22');
        expect(within(dialog).getByLabelText('Game Type')).toHaveValue(
            'madden'
        );
    });

    it('opens nothing when the prompt is closed', async () => {
        setup({
            fileId: 'current',
            path: 'C:/saves/CAREER-CURRENT'
        } as OpenFranchiseFile);
        await userEvent.click(
            within(screen.getByTestId('get-started-card')).getByText(
                'Open a different file...'
            )
        );
        await screen.findByRole('dialog');
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(franchiseAPI.closeFile).not.toHaveBeenCalled();
        expect(franchiseAPI.openFile).not.toHaveBeenCalled();
        expect(setOpenFile).not.toHaveBeenCalled();
    });
});
