import { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@shared/types/notifications';
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
const FTC_PATH = 'C:/saves/franchise-common.FTC';

// userData/commonFileChoices.json
let storedChoices: unknown = null;

// main's notification store
let notificationList: AppNotification[] = [];
function notification(id: string, read = false): AppNotification {
    return {
        id,
        kind: 'schema-mismatch',
        createdAt: Date.now(),
        read,
        data: { expected: null, loaded: null, gameType: 'madden' }
    };
}

const electronAPI = {
    getVersion: vi.fn(async () => '5.0.0'),
    files: { getSaves: vi.fn(async () => ({ success: false })) },
    recentFiles: {
        initialize: vi.fn(async () => undefined),
        getRecentFiles: vi.fn<() => Promise<unknown[]>>(async () => []),
        addFile: vi.fn(async () => []),
        removeFile: vi.fn(async () => [])
    },
    showOpenDialog: vi.fn(async () => ({
        canceled: false,
        filePaths: ['C:/saves/CAREER-TEST']
    })),
    showMessageBox: vi.fn(),
    preferences: { getValue: vi.fn(), set: vi.fn(async () => undefined) },
    fs: {
        readJson: vi.fn(async () => storedChoices),
        writeJson: vi.fn(async (_name: string, data: unknown) => {
            storedChoices = data;
        }),
        exists: vi.fn(async () => true)
    },
    send: vi.fn(),
    notifications: {
        list: vi.fn(async () => notificationList),
        dismiss: vi.fn(async () => undefined),
        markRead: vi.fn(async () => undefined),
        onChanged: vi.fn(() => () => undefined),
        onAdded: vi.fn(() => () => undefined)
    }
};
const franchiseAPI = {
    getMetadataFromFilePath: vi.fn(async () => ({ format: 'franchise' })),
    openFile: vi.fn(async () => ({ fileId: 'file-1', metadata: METADATA })),
    getTableList: vi.fn(async () => []),
    closeFile: vi.fn()
};

const setOpenFile = vi.fn();
const openTableEditor = vi.fn();
const selectTab = vi.fn();

// `current`: the file already open
function setup(current?: OpenFranchiseFile) {
    render(
        <MemoryRouter>
            <FranchiseFileContext.Provider value={[current, setOpenFile]}>
                <EditorTabsContext.Provider
                    value={
                        {
                            openTableEditor,
                            selectTab
                        } as unknown as EditorTabsValue
                    }
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

    it('opens Schemas for the new file with open-schema-viewer', async () => {
        electronAPI.preferences.getValue.mockResolvedValue(
            'open-schema-viewer'
        );
        setup();
        await openFile();

        expect(selectTab).toHaveBeenCalledExactlyOnceWith(
            'schema-management',
            expect.objectContaining({ fileId: 'file-1' })
        );
        expect(setOpenFile.mock.invocationCallOrder[0]).toBeLessThan(
            selectTab.mock.invocationCallOrder[0]
        );
        expect(openTableEditor).not.toHaveBeenCalled();
    });

    it.each(['open-home', 'open-schedule', undefined])(
        'stays Home with %s',
        async (value) => {
            electronAPI.preferences.getValue.mockResolvedValue(value);
            setup();
            await openFile();
            expect(setOpenFile).toHaveBeenCalled();
            expect(openTableEditor).not.toHaveBeenCalled();
            expect(selectTab).not.toHaveBeenCalled();
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

describe('Welcome schema management', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
    });

    it('selects the Schemas tab from the side nav', async () => {
        setup();
        await userEvent.click(screen.getByText('Schema Management'));
        expect(selectTab).toHaveBeenCalledExactlyOnceWith('schema-management');
    });

    it('selects the Schemas tab from the Get Started card', async () => {
        setup({
            fileId: 'file-1',
            path: 'C:/saves/CAREER-TEST',
            metadata: METADATA,
            tables: [],
            revision: 0
        } as unknown as OpenFranchiseFile);
        await userEvent.click(screen.getByText('Open schema management'));
        expect(selectTab).toHaveBeenCalledExactlyOnceWith('schema-management');
    });
});

describe('Welcome schedule editor', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
    });

    function setupWith(type: { gameType?: string }) {
        setup({
            fileId: 'file-1',
            path: 'C:/saves/CAREER-TEST',
            metadata: { ...METADATA, type },
            tables: [],
            revision: 0
        } as unknown as OpenFranchiseFile);
    }

    it('selects the Schedule tab from the Get Started card', async () => {
        setupWith({ gameType: 'madden' });
        await userEvent.click(screen.getByText('Open the schedule editor'));
        expect(selectTab).toHaveBeenCalledExactlyOnceWith('schedule-editor');
    });

    it('is not offered for a file without a schedule', () => {
        setupWith({ gameType: 'cfb' });
        expect(
            screen.queryByText('Open the schedule editor')
        ).not.toBeInTheDocument();
    });
});

describe('Welcome side nav', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
    });

    it('switches to the legacy UI', async () => {
        setup();
        const item = screen.getByText('Switch to legacy UI');
        expect(item.closest('[data-action="switch-ui"]')).not.toBeNull();
        await userEvent.click(item);
        expect(electronAPI.preferences.set).toHaveBeenCalledExactlyOnceWith({
            general: { uiVersion: 'v4' }
        });
    });

    it('opens the release notes from Release Notes', async () => {
        setup();
        await userEvent.click(screen.getByText('Release Notes'));
        expect(electronAPI.send).toHaveBeenCalledExactlyOnceWith(
            'show-settings-manager'
        );
    });

    it('opens Preferences from Settings', async () => {
        setup();
        await userEvent.click(screen.getByText('Settings'));
        expect(electronAPI.send).toHaveBeenCalledExactlyOnceWith(
            'show-preferences-window'
        );
    });
});

describe('Welcome open flow', () => {
    const MISSING = 'C:/saves/CAREER-GONE';
    const KEPT = 'C:/saves/CAREER-KEPT';

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
        electronAPI.preferences.getValue.mockResolvedValue(undefined);
    });

    it('drops a missing recent file from the list', async () => {
        electronAPI.recentFiles.getRecentFiles.mockResolvedValueOnce([
            { path: MISSING, time: 2 },
            { path: KEPT, time: 1 }
        ]);
        electronAPI.fs.exists.mockResolvedValueOnce(false);
        electronAPI.recentFiles.removeFile.mockResolvedValueOnce([
            { path: KEPT, time: 1 }
        ] as never);
        setup();
        const recent = within(screen.getByTestId('recent-files'));
        await userEvent.click(await recent.findByText('CAREER-GONE'));

        await waitFor(() =>
            expect(recent.queryByText('CAREER-GONE')).toBeNull()
        );
        expect(recent.getByText('CAREER-KEPT')).toBeInTheDocument();
        expect(electronAPI.recentFiles.removeFile).toHaveBeenCalledWith(
            MISSING
        );
        expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'File not found' })
        );
        expect(franchiseAPI.openFile).not.toHaveBeenCalled();
        // Once on mount, once after the missing file
        expect(electronAPI.files.getSaves).toHaveBeenCalledTimes(2);
    });

    it('starts the Open dialog in general.defaultDirectory', async () => {
        electronAPI.preferences.getValue.mockImplementation(async (key) =>
            key === 'general.defaultDirectory' ? 'C:/saves' : undefined
        );
        setup();
        await openFile();
        expect(electronAPI.showOpenDialog).toHaveBeenCalledWith(
            expect.objectContaining({ defaultPath: 'C:/saves' })
        );
    });

    it.each([undefined, ''])(
        'passes no defaultPath with defaultDirectory %j',
        async (value) => {
            electronAPI.preferences.getValue.mockImplementation(async (key) =>
                key === 'general.defaultDirectory' ? value : undefined
            );
            setup();
            await openFile();
            expect(
                electronAPI.showOpenDialog.mock.calls[0][0]
            ).not.toHaveProperty('defaultPath');
        }
    );

    it('opens a file from the side nav', async () => {
        setup();
        const item = within(screen.getByRole('complementary')).getByText(
            'Open a file...'
        );
        expect(item.closest('[data-action="open-file"]')).not.toBeNull();
        await userEvent.click(item);
        await waitFor(() =>
            expect(franchiseAPI.openFile).toHaveBeenCalledWith(
                'C:/saves/CAREER-TEST',
                undefined
            )
        );
    });
});

describe('Welcome common files', () => {
    const FTC_PREFS: Record<string, string> = {
        'general.ftcGameYearOverride': '22',
        'general.ftcGameTypeOverride': 'madden'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        storedChoices = null;
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

    it('remembers the choices for the path with the box ticked', async () => {
        setup();
        await clickOpenFile();
        const dialog = await screen.findByRole('dialog');
        await userEvent.selectOptions(
            within(dialog).getByLabelText('Game Year'),
            '27'
        );
        await userEvent.click(
            within(dialog).getByLabelText('Remember my choices for this file')
        );
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Confirm' })
        );
        await waitFor(() => expect(electronAPI.send).toHaveBeenCalled());
        await waitFor(() =>
            expect(storedChoices).toEqual({
                'C:/saves/CAREER-TEST': { gameYear: 27, gameType: 'madden' }
            })
        );
        // The general defaults are left alone
        expect(electronAPI.preferences.set).not.toHaveBeenCalled();
    });

    it('opens a remembered file without asking', async () => {
        storedChoices = {
            'C:/saves/CAREER-TEST': { gameYear: 25, gameType: 'college' }
        };
        setup();
        await openFile();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(franchiseAPI.openFile).toHaveBeenCalledExactlyOnceWith(
            'C:/saves/CAREER-TEST',
            { gameYearOverride: 25, gameTypeOverride: 'college' }
        );
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
            path: 'C:/saves/CAREER-CURRENT',
            metadata: METADATA
        } as unknown as OpenFranchiseFile);
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

describe('Welcome change file parameters', () => {
    const COMMON_FILE = {
        fileId: 'current',
        path: FTC_PATH,
        metadata: {
            gameYear: 25,
            format: 'franchise-common',
            type: { gameType: 'college' }
        }
    } as unknown as OpenFranchiseFile;

    const card = () => within(screen.getByTestId('get-started-card'));
    const changeLink = () => card().queryByText('Change', { exact: true });

    async function openPrompt(): Promise<HTMLElement> {
        setup(COMMON_FILE);
        await userEvent.click(changeLink()!);
        return screen.findByRole('dialog');
    }

    async function confirm(dialog: HTMLElement): Promise<void> {
        await userEvent.click(
            within(dialog).getByRole('button', { name: 'Confirm' })
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    }

    beforeEach(() => {
        vi.clearAllMocks();
        storedChoices = {
            [FTC_PATH]: { gameYear: 25, gameType: 'college' }
        };
        Object.assign(window, { electronAPI, franchiseAPI });
        electronAPI.preferences.getValue.mockResolvedValue(undefined);
    });

    it('is only offered for a common file', () => {
        setup({
            fileId: 'current',
            path: 'C:/saves/CAREER-TEST',
            metadata: METADATA
        } as unknown as OpenFranchiseFile);
        expect(changeLink()).toBeNull();
        expect(card().getByText('CAREER-TEST')).toBeInTheDocument();
    });

    it('shows the game next to the file name', () => {
        setup(COMMON_FILE);
        expect(card().getByText('franchise-common.FTC')).toBeInTheDocument();
        // No games.json entry for CFB 25, so the type label and year
        expect(
            card().getByText('College Football (CFB) 25')
        ).toBeInTheDocument();
        expect(changeLink()).toBeInTheDocument();
    });

    it('re-opens with the new choice without asking', async () => {
        const dialog = await openPrompt();
        expect(within(dialog).getByLabelText('Game Year')).toHaveValue('25');
        expect(within(dialog).getByLabelText('Game Type')).toHaveValue(
            'college'
        );
        expect(
            within(dialog).getByLabelText('Remember my choices for this file')
        ).toBeChecked();
        expect(
            within(dialog).getByText(/re-opens the file/)
        ).toBeInTheDocument();

        await userEvent.selectOptions(
            within(dialog).getByLabelText('Game Year'),
            '27'
        );
        await confirm(dialog);

        await waitFor(() => expect(electronAPI.send).toHaveBeenCalled());
        expect(electronAPI.showMessageBox).not.toHaveBeenCalled();
        expect(franchiseAPI.closeFile).toHaveBeenCalledExactlyOnceWith(
            'current'
        );
        expect(franchiseAPI.openFile).toHaveBeenCalledExactlyOnceWith(
            FTC_PATH,
            { gameYearOverride: 27, gameTypeOverride: 'college' }
        );
        expect(storedChoices).toEqual({
            [FTC_PATH]: { gameYear: 27, gameType: 'college' }
        });
    });

    it('prefills the open file, not the defaults, when nothing is remembered', async () => {
        storedChoices = null;
        electronAPI.preferences.getValue.mockResolvedValue('23');
        const dialog = await openPrompt();
        expect(within(dialog).getByLabelText('Game Year')).toHaveValue('25');
        expect(within(dialog).getByLabelText('Game Type')).toHaveValue(
            'college'
        );
        expect(
            within(dialog).getByLabelText('Remember my choices for this file')
        ).not.toBeChecked();
    });

    it('only updates the remembered choice when the values are unchanged', async () => {
        const dialog = await openPrompt();
        await userEvent.click(
            within(dialog).getByLabelText('Remember my choices for this file')
        );
        await confirm(dialog);
        await waitFor(() => expect(storedChoices).toEqual({}));
        expect(franchiseAPI.closeFile).not.toHaveBeenCalled();
        expect(franchiseAPI.openFile).not.toHaveBeenCalled();
    });

    it('keeps the file open when the prompt is closed', async () => {
        await openPrompt();
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(franchiseAPI.closeFile).not.toHaveBeenCalled();
        expect(franchiseAPI.openFile).not.toHaveBeenCalled();
    });
});

describe('Welcome notifications', () => {
    const bell = () => screen.getByRole('button', { name: 'Notifications' });
    const badge = () => screen.queryByTestId('notification-badge');
    // The side nav is an <aside> too
    const drawer = () =>
        screen.queryByRole('complementary', { name: 'Notifications' });

    beforeEach(() => {
        vi.clearAllMocks();
        notificationList = [];
        Object.assign(window, { electronAPI, franchiseAPI });
    });

    it('toggles the drawer from the bell', async () => {
        setup();
        expect(bell()).toHaveAttribute('aria-expanded', 'false');
        expect(bell()).toHaveAttribute('data-action', 'open-notifications');
        expect(drawer()).toBeNull();

        await userEvent.click(bell());
        expect(bell()).toHaveAttribute('aria-expanded', 'true');
        expect(drawer()).toBeInTheDocument();
        expect(screen.getByText('No notifications')).toBeInTheDocument();

        await userEvent.click(bell());
        expect(bell()).toHaveAttribute('aria-expanded', 'false');
        expect(drawer()).toBeNull();
    });

    it('has no badge without unread notifications', async () => {
        notificationList = [notification('a', true)];
        setup();
        await waitFor(() =>
            expect(electronAPI.notifications.list).toHaveBeenCalled()
        );
        expect(badge()).toBeNull();
    });

    it('counts the unread notifications on the badge', async () => {
        notificationList = [
            notification('a'),
            notification('b'),
            notification('c', true)
        ];
        setup();
        await waitFor(() => expect(badge()).not.toBeNull());
        expect(badge()).toHaveAttribute('data-count', '2');
        expect(badge()).toHaveTextContent('2');
    });

    it('shows 9+ above nine', async () => {
        notificationList = Array.from({ length: 10 }, (_, i) =>
            notification(String(i))
        );
        setup();
        await waitFor(() => expect(badge()).not.toBeNull());
        expect(badge()).toHaveAttribute('data-count', '10');
        expect(badge()).toHaveTextContent('9+');
    });
});
