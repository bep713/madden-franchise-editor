import { describe, expect, it } from 'vitest';
import { FileMetadata } from '@shared/types';
import { findGame } from './useActiveFranchiseFile';

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
