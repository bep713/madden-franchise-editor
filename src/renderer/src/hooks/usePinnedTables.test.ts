import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileMetadata, PinsFile } from '@shared/types';
import { OpenFranchiseFile } from '@renderer/context/FranchiseFileContext';
import usePinnedTables from './usePinnedTables';

const PLAYER = { id: 4220, uniqueId: 1612938518, name: 'Player' };

function makeFile(
    tables: { id: number; uniqueId: number; name: string }[],
    revision = 0
): OpenFranchiseFile {
    return {
        fileId: 'file-1',
        metadata: {
            gameYear: 22,
            type: { gameType: 'madden' }
        } as FileMetadata,
        tables: tables.map((table, index) => ({ ...table, index })),
        revision
    } as OpenFranchiseFile;
}

let stored: PinsFile | null;
const readJson = vi.fn(async () => stored);
const writeJson = vi.fn(async (_name: string, pins: PinsFile) => {
    stored = pins;
});

const playerPin = () =>
    stored
        ?.find((group) => group.gameYear === 22)
        ?.pins.find((pin) => pin.uniqueId === PLAYER.uniqueId);

beforeEach(() => {
    stored = null;
    readJson.mockClear();
    writeJson.mockClear();
    Object.assign(window, { electronAPI: { fs: { readJson, writeJson } } });
});

describe('usePinnedTables', () => {
    it('prepares the pins again against the new tables on a reopen', async () => {
        const { result, rerender } = renderHook(
            ({ file }) => usePinnedTables(file),
            { initialProps: { file: makeFile([PLAYER]) } }
        );
        await waitFor(() =>
            expect(result.current.pinnedTables.map((t) => t.id)).toEqual([
                PLAYER.id
            ])
        );
        expect(playerPin()?.tableId).toBe(PLAYER.id);

        // A schema load moved the table to another id
        const moved = { ...PLAYER, id: 5000 };
        rerender({ file: makeFile([moved], 1) });

        await waitFor(() => expect(playerPin()?.tableId).toBe(moved.id));
        expect(readJson).toHaveBeenCalledTimes(2);
        expect(result.current.pinnedTables.map((t) => t.id)).toEqual([
            moved.id
        ]);
    });
});
