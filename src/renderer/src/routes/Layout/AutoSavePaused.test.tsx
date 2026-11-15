import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppNotification } from '@shared/types/notifications';
import { ExternalChangeContext } from '@renderer/context/ExternalChangeContext';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import AutoSavePaused from './AutoSavePaused';

let changed: ((list: AppNotification[]) => void)[] = [];
let stored: AppNotification[] = [];
let autoSave: unknown = [true];

const openFile = {
    fileId: 'file-1',
    path: 'C:/saves/CAREER-TEST',
    revision: 0
} as OpenFranchiseFile;

function fileChanged(fileId: string): AppNotification {
    return {
        id: `n-${fileId}`,
        kind: 'file-changed',
        createdAt: Date.now(),
        read: false,
        fileId,
        data: { path: 'C:/saves/CAREER-TEST' }
    };
}

function fileMissing(fileId: string): AppNotification {
    return {
        id: `m-${fileId}`,
        kind: 'file-missing',
        createdAt: Date.now(),
        read: false,
        fileId,
        data: { path: 'C:/saves/CAREER-TEST' }
    };
}

const reload = vi.fn(async () => {});
const branch = vi.fn(async () => {});
const saveHere = vi.fn(async () => {});

function renderStrip(file: OpenFranchiseFile | null = openFile) {
    return render(
        <FranchiseFileContext.Provider value={[file ?? undefined, undefined]}>
            <ExternalChangeContext.Provider
                value={{ reload, branch, saveHere }}
            >
                <AutoSavePaused />
            </ExternalChangeContext.Provider>
        </FranchiseFileContext.Provider>
    );
}

// Lets list() and getValue() resolve
async function settle() {
    await act(async () => {});
}

beforeEach(() => {
    changed = [];
    stored = [];
    autoSave = [true];
    window.electronAPI = {
        notifications: {
            list: vi.fn(async () => stored),
            onChanged: vi.fn((callback: (list: AppNotification[]) => void) => {
                changed.push(callback);
                return () => {
                    changed = changed.filter((l) => l !== callback);
                };
            })
        },
        preferences: {
            getValue: vi.fn(async () => autoSave)
        }
    } as unknown as typeof window.electronAPI;
});

afterEach(() => {
    vi.clearAllMocks();
});

const strip = () => screen.queryByTestId('auto-save-paused');

describe('AutoSavePaused', () => {
    it('shows for the open file with auto-save on, and its buttons act on it', async () => {
        stored = [fileChanged('file-1')];
        renderStrip();
        await settle();

        expect(strip()?.textContent).toContain('CAREER-TEST was changed');
        await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
        expect(reload).toHaveBeenCalledWith('file-1');
        await userEvent.click(
            screen.getByRole('button', { name: 'Branch and save new' })
        );
        expect(branch).toHaveBeenCalledWith('file-1');
    });

    it('shows the missing text for File Missing, and its buttons act on it', async () => {
        stored = [fileMissing('file-1')];
        renderStrip();
        await settle();

        expect(strip()?.textContent).toContain(
            'CAREER-TEST was deleted or moved outside the editor.'
        );
        expect(screen.queryByRole('button', { name: 'Reload' })).toBeNull();
        await userEvent.click(
            screen.getByRole('button', { name: 'Save here' })
        );
        expect(saveHere).toHaveBeenCalledWith('file-1');
        await userEvent.click(
            screen.getByRole('button', { name: 'Save as new' })
        );
        expect(branch).toHaveBeenCalledWith('file-1');
    });

    it('prefers File Missing when both are stored', async () => {
        stored = [fileChanged('file-1'), fileMissing('file-1')];
        renderStrip();
        await settle();
        expect(strip()?.getAttribute('data-reason')).toBe('missing');
    });

    it('follows notifications:changed', async () => {
        renderStrip();
        await settle();
        expect(strip()).toBeNull();

        act(() => changed.forEach((l) => l([fileChanged('file-1')])));
        expect(strip()).not.toBeNull();

        act(() => changed.forEach((l) => l([])));
        expect(strip()).toBeNull();
    });

    it('is hidden with auto-save off', async () => {
        autoSave = [];
        stored = [fileChanged('file-1')];
        renderStrip();
        await settle();
        expect(strip()).toBeNull();
    });

    it('is hidden for another fileId', async () => {
        stored = [fileChanged('file-2')];
        renderStrip();
        await settle();
        expect(strip()).toBeNull();
    });

    it('is hidden with no file open', async () => {
        stored = [fileChanged('file-1')];
        renderStrip(null);
        await settle();
        expect(strip()).toBeNull();
    });
});
