import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FranchiseFileContext } from '@renderer/context/FranchiseFileContext';
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
    preferences: { getValue: vi.fn() },
    send: vi.fn()
};
const franchiseAPI = {
    openFile: vi.fn(async () => ({ fileId: 'file-1', metadata: METADATA })),
    getTableList: vi.fn(async () => []),
    closeFile: vi.fn()
};

const setOpenFile = vi.fn();
const openTableEditor = vi.fn();

function setup() {
    render(
        <MemoryRouter>
            <FranchiseFileContext.Provider value={[undefined, setOpenFile]}>
                <EditorTabsContext.Provider
                    value={{ openTableEditor } as unknown as EditorTabsValue}
                >
                    <Welcome />
                </EditorTabsContext.Provider>
            </FranchiseFileContext.Provider>
        </MemoryRouter>
    );
}

async function openFile(): Promise<void> {
    // The side nav has its own "Open a file..." link
    await userEvent.click(
        within(screen.getByTestId('get-started-card')).getByText(
            'Open a file...'
        )
    );
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
