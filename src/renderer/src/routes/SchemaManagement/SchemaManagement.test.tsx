import { useEffect, useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { AddedSchema, FileMetadata, SchemaEntry } from '@shared/types';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import {
    PendingOpen,
    PendingOpenContext
} from '@renderer/context/PendingOpenContext';
import SchemaManagement from './SchemaManagement';

// The open flow has its own tests (useOpenFile.test.ts)
const openFileAt = vi.fn();
vi.mock('@renderer/hooks/useOpenFile', () => ({
    default: () => openFileAt
}));

// AutoSizer measures 0x0 in jsdom, which renders no rows
vi.mock('react-virtualized-auto-sizer', () => ({
    default: ({
        children
    }: {
        children: (size: { height: number; width: number }) => unknown;
    }) => children({ height: 600, width: 400 })
}));

const DIR = 'C:\\userData\\schemas';
const BUNDLED: SchemaEntry = {
    gameType: 'madden',
    gameYear: 22,
    major: 329,
    minor: 1,
    path: 'C:\\app\\schemas\\22\\M22_329_1.gz',
    source: 'bundled'
};
const CUSTOM: SchemaEntry = {
    ...BUNDLED,
    path: `${DIR}\\M22_329_1.gz`,
    source: 'custom'
};
const OLDER: SchemaEntry = {
    ...BUNDLED,
    minor: 0,
    path: 'C:\\app\\schemas\\22\\M22_329_0.gz'
};
const ENTRIES = [BUNDLED, CUSTOM, OLDER];

const V329_1 = { gameYear: 22, major: 329, minor: 1 };

function metadata(loadedPath: string, loadedMinor = 1): FileMetadata {
    return {
        gameYear: 22,
        type: { gameType: 'madden' },
        expectedSchemaVersion: V329_1,
        schemaList: {
            meta: { ...V329_1, minor: loadedMinor },
            path: loadedPath
        }
    } as FileMetadata;
}

function file(meta: FileMetadata): OpenFranchiseFile {
    return {
        fileId: 'file-1',
        path: 'C:\\saves\\CAREER-TEST',
        metadata: meta,
        tables: [],
        revision: 2
    };
}

const electronAPI = {
    showMessageBox: vi.fn(),
    schema: {
        initialize: vi.fn(async () => DIR),
        delete: vi.fn(async () => ({ success: true })),
        restorePrevious: vi.fn(),
        getFields: vi.fn(async () => ({
            meta: null,
            fields: [{ name: 'FirstName', table: 'Player', type: 'string' }]
        }))
    },
    files: { openFolder: vi.fn(async () => undefined) }
};
const franchiseAPI = {
    getSavedSchemas: vi.fn(async () => ENTRIES),
    hasUnsavedChanges: vi.fn(async () => false),
    loadSchema: vi.fn(),
    getTableList: vi.fn(async () => [])
};

const setOpenFile = vi.fn();
// The latest pending file, as App's state holds it
let currentPending: PendingOpen | undefined;

function PendingHarness({ initial }: { initial?: PendingOpen }) {
    const value = useState(initial);
    useEffect(() => {
        currentPending = value[0];
    }, [value]);
    return (
        <PendingOpenContext.Provider value={value}>
            <SchemaManagement />
        </PendingOpenContext.Provider>
    );
}

function tree(
    current?: OpenFranchiseFile,
    pending?: PendingOpen,
    added?: AddedSchema
) {
    return (
        <MemoryRouter
            initialEntries={[
                {
                    pathname: '/schema-management',
                    state: added ? { added } : null
                }
            ]}
        >
            <FranchiseFileContext.Provider value={[current, setOpenFile]}>
                <Routes>
                    <Route
                        element={<PendingHarness initial={pending} />}
                        path='/schema-management'
                    />
                    <Route
                        element={<p>Add schema page</p>}
                        path='/schema-management/add'
                    />
                </Routes>
            </FranchiseFileContext.Provider>
        </MemoryRouter>
    );
}

async function setup(
    current?: OpenFranchiseFile,
    pending?: PendingOpen,
    added?: AddedSchema
): Promise<(next?: OpenFranchiseFile) => void> {
    const { rerender } = render(tree(current, pending, added));
    await screen.findByText('Madden 22 Schemas');
    // Labels use the schema dir once it arrives
    await waitFor(() =>
        expect(electronAPI.schema.initialize).toHaveBeenCalled()
    );
    // Swaps the open file, as App's state would
    return (next) => rerender(tree(next, pending, added));
}

function row(name: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(
        `[data-name="${name}"]`
    );
    if (!element) throw new Error(`No row ${name}`);
    return element;
}

// Link renders an <a> without href, so it has no link role
const hasLink = (name: string): boolean =>
    row(name).querySelector('a') !== null;

const hasBundledBadge = (name: string): boolean =>
    row(name).querySelector('[data-testid="bundled-schema"]') !== null;

const hasActiveBadge = (name: string): boolean =>
    row(name).querySelector('[data-testid="active-schema"]') !== null;

describe('SchemaManagement', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { electronAPI, franchiseAPI });
        electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
        franchiseAPI.hasUnsavedChanges.mockResolvedValue(false);
        franchiseAPI.loadSchema.mockImplementation(
            async (_id: string, path: string) => ({
                status: 'successful',
                metadata: metadata(path)
            })
        );
    });

    it('lists plain names and no loaded card without a file', async () => {
        await setup();
        expect(screen.queryByTestId('loaded-schema')).toBeNull();
        expect(hasLink('M22 v329.1')).toBe(false);
        expect(hasLink('M22 v329.1 (Custom)')).toBe(false);
        // Custom schemas can still be deleted
        expect(
            screen.getByRole('button', { name: 'Delete M22 v329.1 (Custom)' })
        ).toBeTruthy();
        expect(
            document.querySelectorAll('[data-action="delete-schema"]')
        ).toHaveLength(1);
    });

    it('marks bundled schemas as undeletable', async () => {
        await setup();
        expect(hasBundledBadge('M22 v329.1')).toBe(true);
        expect(hasBundledBadge('M22 v329.0')).toBe(true);
        expect(hasBundledBadge('M22 v329.1 (Custom)')).toBe(false);
        const badge = within(row('M22 v329.1')).getByRole('img', {
            name: 'Bundled schema - cannot delete'
        });
        expect(badge.getAttribute('title')).toBe(
            'Bundled schema - cannot delete'
        );
    });

    it('keeps the bundled badge on the loaded bundled schema', async () => {
        await setup(file(metadata(BUNDLED.path)));
        expect(row('M22 v329.1').dataset.loaded).toBeDefined();
        expect(hasBundledBadge('M22 v329.1')).toBe(true);
        expect(hasActiveBadge('M22 v329.1')).toBe(false);
    });

    it('marks the loaded custom schema as active', async () => {
        await setup(file(metadata(CUSTOM.path)));
        const badge = within(row('M22 v329.1 (Custom)')).getByRole('img', {
            name: 'Active schema - cannot delete'
        });
        expect(badge.getAttribute('title')).toBe(
            'Active schema - cannot delete'
        );
        expect(hasActiveBadge('M22 v329.1')).toBe(false);
    });

    it('shows no active badge without a file', async () => {
        await setup();
        expect(hasActiveBadge('M22 v329.1 (Custom)')).toBe(false);
    });

    it('links other schemas and bolds the loaded one', async () => {
        await setup(file(metadata(BUNDLED.path)));
        expect(row('M22 v329.1').dataset.loaded).toBeDefined();
        expect(hasLink('M22 v329.1')).toBe(false);
        expect(hasLink('M22 v329.1 (Custom)')).toBe(true);
        expect(hasLink('M22 v329.0')).toBe(true);
        expect(row('M22 v329.1 (Custom)').dataset.loaded).toBeUndefined();
    });

    it('hides the trash on the loaded custom schema', async () => {
        await setup(file(metadata(CUSTOM.path)));
        expect(
            screen.queryByRole('button', {
                name: 'Delete M22 v329.1 (Custom)'
            })
        ).toBeNull();
    });

    it('shows a match without an Expected link when the expected schema is loaded', async () => {
        // The custom copy is the preferred expected entry
        await setup(file(metadata(CUSTOM.path)));
        const card = screen.getByTestId('loaded-schema');
        expect(
            card.querySelector('[data-status]')?.getAttribute('data-status')
        ).toBe('match');
        expect(card.querySelector('[data-field="loaded"]')?.textContent).toBe(
            'M22 v329.1 (Custom)'
        );
        expect(card.querySelector('[data-action="load-expected"]')).toBeNull();
    });

    it('shows a mismatch with an Expected link that loads it', async () => {
        await setup(file(metadata(OLDER.path, 0)));
        const card = screen.getByTestId('loaded-schema');
        expect(
            card.querySelector('[data-status]')?.getAttribute('data-status')
        ).toBe('mismatch');
        const link = card.querySelector<HTMLElement>(
            '[data-action="load-expected"]'
        )!;
        expect(link.textContent).toBe('M22 v329.1');

        await userEvent.click(link);
        await waitFor(() =>
            expect(franchiseAPI.loadSchema).toHaveBeenCalledWith(
                'file-1',
                CUSTOM.path,
                false
            )
        );
    });

    it('shows Unknown and no link without an expected version', async () => {
        await setup(
            file({
                ...metadata(BUNDLED.path),
                expectedSchemaVersion: null
            })
        );
        const card = screen.getByTestId('loaded-schema');
        expect(
            card.querySelector('[data-status]')?.getAttribute('data-status')
        ).toBe('mismatch');
        expect(card.querySelector('[data-field="expected"]')?.textContent).toBe(
            'Unknown'
        );
        expect(card.querySelector('[data-action="load-expected"]')).toBeNull();
    });

    it('loads a clean file without prompting and bumps the revision', async () => {
        await setup(file(metadata(BUNDLED.path)));
        await userEvent.click(
            within(row('M22 v329.0')).getByText('M22 v329.0')
        );

        await waitFor(() => expect(setOpenFile).toHaveBeenCalled());
        expect(electronAPI.showMessageBox).not.toHaveBeenCalled();
        expect(franchiseAPI.loadSchema).toHaveBeenCalledWith(
            'file-1',
            OLDER.path,
            false
        );
        expect(setOpenFile).toHaveBeenCalledWith(
            expect.objectContaining({
                fileId: 'file-1',
                path: 'C:\\saves\\CAREER-TEST',
                revision: 3,
                metadata: expect.objectContaining({
                    schemaList: expect.objectContaining({ path: OLDER.path })
                })
            })
        );
    });

    it('asks before loading over unsaved changes', async () => {
        franchiseAPI.hasUnsavedChanges.mockResolvedValue(true);
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await setup(file(metadata(BUNDLED.path)));

        await userEvent.click(
            within(row('M22 v329.0')).getByText('M22 v329.0')
        );
        await waitFor(() =>
            expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: 'Load schema M22 v329.0?',
                    buttons: ['Load', 'Cancel'],
                    defaultId: 1,
                    cancelId: 1
                })
            )
        );
        expect(franchiseAPI.loadSchema).not.toHaveBeenCalled();

        electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
        await userEvent.click(
            within(row('M22 v329.0')).getByText('M22 v329.0')
        );
        await waitFor(() => expect(franchiseAPI.loadSchema).toHaveBeenCalled());
    });

    it('prompts when the unsaved check fails', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        franchiseAPI.hasUnsavedChanges.mockRejectedValue(new Error('nope'));
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await setup(file(metadata(BUNDLED.path)));

        await userEvent.click(
            within(row('M22 v329.0')).getByText('M22 v329.0')
        );
        await waitFor(() =>
            expect(electronAPI.showMessageBox).toHaveBeenCalled()
        );
        expect(franchiseAPI.loadSchema).not.toHaveBeenCalled();
    });

    it('shows an error and keeps the file when a load fails', async () => {
        franchiseAPI.loadSchema.mockResolvedValue({ error: 'bad schema' });
        await setup(file(metadata(BUNDLED.path)));

        await userEvent.click(
            within(row('M22 v329.0')).getByText('M22 v329.0')
        );
        await waitFor(() =>
            expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    message: 'Could not load schema M22 v329.0.',
                    detail: 'bad schema'
                })
            )
        );
        expect(setOpenFile).not.toHaveBeenCalled();
    });

    it('deletes a custom schema after confirming', async () => {
        await setup();
        await userEvent.click(
            screen.getByRole('button', { name: 'Delete M22 v329.1 (Custom)' })
        );
        await waitFor(() =>
            expect(electronAPI.schema.delete).toHaveBeenCalledWith(CUSTOM.path)
        );
        expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Delete schema M22 v329.1 (Custom)?',
                detail: CUSTOM.path,
                buttons: ['Delete', 'Cancel']
            })
        );
        // Refreshed after the delete
        await waitFor(() =>
            expect(franchiseAPI.getSavedSchemas).toHaveBeenCalledTimes(2)
        );
    });

    it('keeps the schema when the delete is cancelled', async () => {
        electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
        await setup();
        await userEvent.click(
            screen.getByRole('button', { name: 'Delete M22 v329.1 (Custom)' })
        );
        await waitFor(() =>
            expect(electronAPI.showMessageBox).toHaveBeenCalled()
        );
        expect(electronAPI.schema.delete).not.toHaveBeenCalled();
    });

    it('opens the schema directory', async () => {
        await setup();
        await userEvent.click(screen.getByText('Open schema directory'));
        await waitFor(() =>
            expect(electronAPI.files.openFolder).toHaveBeenCalledWith(DIR)
        );
        expect(
            screen.getByText('Scan for schemas').closest('[aria-disabled]')
        ).toBeTruthy();
        expect(
            screen.getByText('Add schema').closest('[aria-disabled]')
        ).toBeNull();
    });

    describe('pending file', () => {
        const PENDING: PendingOpen = {
            path: 'C:\\saves\\FTC-TEST',
            openOptions: { gameYearOverride: 18, gameTypeOverride: 'madden' },
            game: { gameYear: 18, gameType: 'madden' },
            notificationId: 'n1'
        };

        it('shows the pending card and links every name without a file', async () => {
            await setup(undefined, PENDING);
            const card = screen.getByTestId('pending-file');
            expect(card).toHaveTextContent('Choose a schema for FTC-TEST');
            expect(card).toHaveTextContent('No schema exists for M18.');
            expect(hasLink('M22 v329.1')).toBe(true);
            expect(hasLink('M22 v329.0')).toBe(true);
            expect(hasLink('M22 v329.1 (Custom)')).toBe(true);
        });

        it('says this game when the game is unknown', async () => {
            await setup(undefined, { path: PENDING.path });
            expect(screen.getByTestId('pending-file')).toHaveTextContent(
                'No schema exists for this game.'
            );
        });

        it('replaces the loaded card and links the loaded schema', async () => {
            await setup(file(metadata(BUNDLED.path)), PENDING);
            expect(screen.getByTestId('pending-file')).toBeTruthy();
            expect(screen.queryByTestId('loaded-schema')).toBeNull();
            expect(hasLink('M22 v329.1')).toBe(true);
        });

        it('Cancel clears the pending file', async () => {
            await setup(file(metadata(BUNDLED.path)), PENDING);
            await userEvent.click(screen.getByText('Cancel'));
            expect(currentPending).toBeUndefined();
            expect(screen.queryByTestId('pending-file')).toBeNull();
            expect(screen.getByTestId('loaded-schema')).toBeTruthy();
            expect(hasLink('M22 v329.1')).toBe(false);
        });

        it('a pick opens the file with that schema, without prompting', async () => {
            openFileAt.mockResolvedValue({
                status: 'opened',
                recentFiles: []
            });
            await setup(file(metadata(BUNDLED.path)), PENDING);
            await userEvent.click(
                within(row('M22 v329.0')).getByText('M22 v329.0')
            );
            await waitFor(() =>
                expect(openFileAt).toHaveBeenCalledExactlyOnceWith(
                    PENDING.path,
                    {
                        gameYearOverride: 18,
                        gameTypeOverride: 'madden',
                        schemaOverride: { path: OLDER.path }
                    }
                )
            );
            expect(franchiseAPI.loadSchema).not.toHaveBeenCalled();
            expect(franchiseAPI.hasUnsavedChanges).not.toHaveBeenCalled();
            expect(electronAPI.showMessageBox).not.toHaveBeenCalled();
        });

        it('keeps the pending file when the open fails', async () => {
            openFileAt.mockResolvedValue({
                status: 'error',
                error: 'bad file'
            });
            await setup(undefined, PENDING);
            await userEvent.click(
                within(row('M22 v329.1')).getByText('M22 v329.1')
            );
            await waitFor(() => expect(openFileAt).toHaveBeenCalled());
            expect(currentPending).toEqual(PENDING);
            expect(screen.getByTestId('pending-file')).toBeTruthy();
        });
    });

    describe('schema viewer', () => {
        const viewer = (): HTMLElement | null =>
            screen.queryByRole('complementary', { name: 'Schema viewer' });

        const title = (): string | null =>
            viewer()?.querySelector('h2')?.textContent ?? null;

        const fieldInput = (): HTMLInputElement =>
            screen.getByLabelText('Field') as HTMLInputElement;

        const viewLoadedLink = (): HTMLElement | null =>
            document.querySelector('[data-action="view-loaded-schema"]');

        async function waitForViewer(): Promise<void> {
            await screen.findByRole('complementary', {
                name: 'Schema viewer'
            });
        }

        async function view(name: string): Promise<void> {
            await userEvent.click(
                within(row(name)).getByRole('button', { name: `View ${name}` })
            );
            await waitForViewer();
        }

        it('hides View loaded schema without a file', async () => {
            await setup();
            expect(viewLoadedLink()).toBeNull();
        });

        it('hides View loaded schema while a file is pending', async () => {
            await setup(file(metadata(BUNDLED.path)), {
                path: 'C:\\saves\\FTC-TEST'
            });
            expect(viewLoadedLink()).toBeNull();
        });

        it('an eye opens the pane on that schema', async () => {
            await setup();
            expect(viewer()).toBeNull();
            await view('M22 v329.1 (Custom)');
            expect(title()).toBe('M22 v329.1 (Custom) Schema Viewer');
            expect(row('M22 v329.1 (Custom)').dataset.viewing).toBeDefined();
            expect(row('M22 v329.1').dataset.viewing).toBeUndefined();
            expect(electronAPI.schema.getFields).toHaveBeenCalledWith({
                path: CUSTOM.path
            });
        });

        it('keeps the filters when switching schemas', async () => {
            await setup();
            await view('M22 v329.1');
            await userEvent.type(fieldInput(), 'Name');
            await view('M22 v329.0');
            expect(title()).toBe('M22 v329.0 Schema Viewer');
            expect(fieldInput().value).toBe('Name');
        });

        it('resets the filters when closed and reopened', async () => {
            await setup();
            await view('M22 v329.1');
            await userEvent.type(fieldInput(), 'Name');
            await userEvent.click(
                screen.getByRole('button', { name: 'Close schema viewer' })
            );
            expect(viewer()).toBeNull();
            expect(row('M22 v329.1').dataset.viewing).toBeUndefined();
            await view('M22 v329.1');
            expect(fieldInput().value).toBe('');
        });

        it('closes when the viewed custom schema is deleted', async () => {
            await setup();
            await view('M22 v329.1 (Custom)');
            // The refresh still lists it, so only the delete closes the pane
            await userEvent.click(
                screen.getByRole('button', {
                    name: 'Delete M22 v329.1 (Custom)'
                })
            );
            await waitFor(() => expect(viewer()).toBeNull());
        });

        it('closes when a refresh drops the viewed schema', async () => {
            await setup();
            await view('M22 v329.0');
            franchiseAPI.getSavedSchemas.mockResolvedValueOnce([
                BUNDLED,
                CUSTOM
            ]);
            await userEvent.click(
                document.querySelector<HTMLElement>(
                    '[data-action="refresh-schemas"]'
                )!
            );
            await waitFor(() => expect(viewer()).toBeNull());
        });

        it('views the loaded schema by path when it is listed', async () => {
            await setup(file(metadata(BUNDLED.path)));
            await userEvent.click(viewLoadedLink()!);
            await waitForViewer();
            expect(title()).toBe('M22 v329.1 Schema Viewer');
            expect(electronAPI.schema.getFields).toHaveBeenCalledWith({
                path: BUNDLED.path
            });
            expect(row('M22 v329.1').dataset.viewing).toBeDefined();
        });

        it('views an embedded schema by file and closes on a reload', async () => {
            const current = file(metadata(''));
            const swap = await setup(current);
            await userEvent.click(viewLoadedLink()!);
            await waitForViewer();
            expect(title()).toBe('M22 v329.1 Schema Viewer');
            expect(electronAPI.schema.getFields).toHaveBeenCalledWith({
                fileId: 'file-1'
            });

            act(() => swap({ ...current, revision: current.revision + 1 }));
            await waitFor(() => expect(viewer()).toBeNull());
        });

        it('stays on the viewed schema when another one loads', async () => {
            const swap = await setup(file(metadata(BUNDLED.path)));
            await userEvent.click(viewLoadedLink()!);
            await waitForViewer();

            act(() => swap({ ...file(metadata(OLDER.path, 0)), revision: 3 }));
            expect(title()).toBe('M22 v329.1 Schema Viewer');
            expect(row('M22 v329.1').dataset.viewing).toBeDefined();
            expect(row('M22 v329.1').dataset.loaded).toBeUndefined();
        });
    });
    describe('added banner', () => {
        const ADDED: AddedSchema = {
            identity: {
                gameType: 'madden',
                gameYear: 22,
                major: 329,
                minor: 1
            },
            fileName: 'M22_329_1.gz',
            path: CUSTOM.path,
            replaced: false,
            loadedBy: [],
            warnings: []
        };

        const banner = (): HTMLElement =>
            document.querySelector<HTMLElement>('[data-kind="schema-added"]')!;

        it('Add schema goes to the Add page', async () => {
            await setup();
            await userEvent.click(screen.getByText('Add schema'));
            expect(await screen.findByText('Add schema page')).toBeTruthy();
        });

        it('shows no banner without a result', async () => {
            await setup();
            expect(banner()).toBeNull();
        });

        it('says Added and View opens the viewer on it', async () => {
            await setup(undefined, undefined, ADDED);
            expect(
                within(banner()).getByText('Added Madden 22 329.1')
            ).toBeTruthy();
            expect(
                within(banner()).queryByRole('button', { name: 'Undo' })
            ).toBeNull();
            await userEvent.click(
                within(banner()).getByRole('button', { name: 'View' })
            );
            await screen.findByRole('complementary', { name: 'Schema viewer' });
            expect(electronAPI.schema.getFields).toHaveBeenCalledWith({
                path: CUSTOM.path
            });
            expect(banner()).toBeNull();
        });

        it('lists the result warnings in post-add wording', async () => {
            await setup(undefined, undefined, {
                ...ADDED,
                warnings: [
                    {
                        code: 'missing-includes-accepted',
                        severity: 'warning',
                        files: ['NESTED.FTX']
                    },
                    {
                        code: 'version-guessed',
                        severity: 'warning',
                        files: ['CAREER-TEST']
                    }
                ]
            });
            const accepted = banner().querySelector(
                '[data-problem="missing-includes-accepted"]'
            );
            expect(accepted?.textContent).toBe('Generated without NESTED.FTX.');
            const guessed = banner().querySelector(
                '[data-problem="version-guessed"]'
            );
            expect(guessed?.textContent).toBe(
                'The version was guessed from CAREER-TEST.'
            );
            expect(banner().textContent).not.toContain(
                'Check it before adding'
            );
        });

        it('Undo restores the previous copy and refreshes the list', async () => {
            electronAPI.schema.restorePrevious.mockResolvedValue({
                status: 'restored',
                restored: [CUSTOM.path]
            });
            await setup(undefined, undefined, { ...ADDED, replaced: true });
            expect(
                within(banner()).getByText(
                    'Replaced your custom Madden 22 329.1'
                )
            ).toBeTruthy();
            const calls = franchiseAPI.getSavedSchemas.mock.calls.length;
            await userEvent.click(
                within(banner()).getByRole('button', { name: 'Undo' })
            );
            await waitFor(() =>
                expect(franchiseAPI.getSavedSchemas.mock.calls.length).toBe(
                    calls + 1
                )
            );
            expect(electronAPI.schema.restorePrevious).toHaveBeenCalledTimes(1);
            expect(electronAPI.showMessageBox).not.toHaveBeenCalled();
        });

        it('says so when there is nothing left to undo', async () => {
            electronAPI.schema.restorePrevious.mockResolvedValue({
                status: 'gone'
            });
            await setup(undefined, undefined, { ...ADDED, replaced: true });
            await userEvent.click(
                within(banner()).getByRole('button', { name: 'Undo' })
            );
            await waitFor(() =>
                expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
                    expect.objectContaining({ message: 'Nothing to undo.' })
                )
            );
        });

        it('Use it in loads the new copy into the open file', async () => {
            await setup(file(metadata(OLDER.path, 0)), undefined, {
                ...ADDED,
                replaced: true,
                loadedBy: [
                    { fileId: 'file-1', filePath: 'C:\\saves\\CAREER-TEST' }
                ]
            });
            await userEvent.click(
                within(banner()).getByRole('button', {
                    name: 'Use it in CAREER-TEST'
                })
            );
            await waitFor(() =>
                expect(franchiseAPI.loadSchema).toHaveBeenCalledWith(
                    'file-1',
                    CUSTOM.path,
                    false
                )
            );
        });

        it('offers Use it in only for the open file', async () => {
            await setup(file(metadata(OLDER.path, 0)), undefined, {
                ...ADDED,
                replaced: true,
                loadedBy: [{ fileId: 'other', filePath: 'C:\\saves\\OTHER' }]
            });
            expect(
                within(banner()).queryByRole('button', { name: /Use it in/ })
            ).toBeNull();
        });
    });
});
