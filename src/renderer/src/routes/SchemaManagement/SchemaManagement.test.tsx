import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileMetadata, SchemaEntry } from '@shared/types';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import SchemaManagement from './SchemaManagement';

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
        delete: vi.fn(async () => ({ success: true }))
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

async function setup(current?: OpenFranchiseFile): Promise<void> {
    render(
        <FranchiseFileContext.Provider value={[current, setOpenFile]}>
            <SchemaManagement />
        </FranchiseFileContext.Provider>
    );
    await screen.findByText('Madden 22 Schemas');
    // Labels use the schema dir once it arrives
    await waitFor(() =>
        expect(electronAPI.schema.initialize).toHaveBeenCalled()
    );
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
        expect(screen.getAllByRole('button')).toHaveLength(1);
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
            screen.getByText('Add schema').closest('[aria-disabled]')
        ).toBeTruthy();
    });
});
