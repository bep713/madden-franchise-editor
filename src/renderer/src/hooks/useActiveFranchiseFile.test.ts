import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FileMetadata } from '@shared/types';
import useActiveFranchiseFile, { findGame } from './useActiveFranchiseFile';

function metadata(gameYear: number, gameType?: string): FileMetadata {
    return { gameYear, type: { gameType } } as unknown as FileMetadata;
}

describe('findGame', () => {
    it('finds the Madden game for a madden file', () => {
        expect(findGame(metadata(27, 'madden'))?.abbreviation).toBe('M27');
    });

    it('finds the College Football game for a college file of the same year', () => {
        expect(findGame(metadata(27, 'college'))?.abbreviation).toBe('C27');
    });

    it('treats a file without a gameType as Madden', () => {
        expect(findGame(metadata(22))?.abbreviation).toBe('M22');
    });

    it('finds nothing for an unknown game', () => {
        expect(findGame(metadata(22, 'college'))).toBeUndefined();
    });
});

describe('useActiveFranchiseFile', () => {
    const METADATA = { gameYear: 22, format: 'franchise', type: { year: 22 } };
    const PATH = 'C:/saves/CAREER-TEST';

    const franchiseAPI = {
        getActiveFile: vi.fn(),
        getMetadata: vi.fn(async () => METADATA),
        getTableList: vi.fn(async () => [])
    };
    const electronAPI = { send: vi.fn() };

    beforeEach(() => {
        vi.clearAllMocks();
        Object.assign(window, { franchiseAPI, electronAPI });
    });

    it('restores the file main has open, with its path', async () => {
        franchiseAPI.getActiveFile.mockResolvedValue({
            fileId: 'file-1',
            path: PATH,
            loaded: true
        });
        const { result } = renderHook(() => useActiveFranchiseFile());
        await waitFor(() => expect(result.current[0]).toBeDefined());
        expect(result.current[0]).toMatchObject({
            fileId: 'file-1',
            path: PATH,
            metadata: METADATA
        });
        expect(electronAPI.send).not.toHaveBeenCalled();
    });

    it('sends file-loaded when the open was cut off before it', async () => {
        franchiseAPI.getActiveFile.mockResolvedValue({
            fileId: 'file-1',
            path: PATH,
            loaded: false
        });
        const { result } = renderHook(() => useActiveFranchiseFile());
        await waitFor(() => expect(result.current[0]).toBeDefined());
        expect(electronAPI.send).toHaveBeenCalledExactlyOnceWith(
            'file-loaded',
            { path: PATH, type: METADATA.type, fileId: 'file-1' }
        );
    });

    it('leaves no file when main has none open', async () => {
        franchiseAPI.getActiveFile.mockResolvedValue(null);
        const { result } = renderHook(() => useActiveFranchiseFile());
        await waitFor(() =>
            expect(franchiseAPI.getActiveFile).toHaveBeenCalled()
        );
        await Promise.resolve();
        expect(result.current[0]).toBeUndefined();
        expect(franchiseAPI.getMetadata).not.toHaveBeenCalled();
        expect(electronAPI.send).not.toHaveBeenCalled();
    });
});
