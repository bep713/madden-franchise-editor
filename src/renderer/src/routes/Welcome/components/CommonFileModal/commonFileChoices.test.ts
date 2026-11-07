import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    COMMON_FILE_CHOICES_FILENAME,
    getRememberedChoice,
    setRememberedChoice
} from './commonFileChoices';

let stored: unknown = null;
const fs = {
    readJson: vi.fn(async () => stored),
    writeJson: vi.fn(async (_name: string, data: unknown) => {
        stored = data;
    })
};

beforeEach(() => {
    stored = null;
    vi.clearAllMocks();
    Object.assign(window, { electronAPI: { fs } });
});

describe('commonFileChoices', () => {
    it('returns null when nothing is saved', async () => {
        expect(await getRememberedChoice('C:/a.FTC')).toBeNull();
    });

    it('remembers a choice by path', async () => {
        await setRememberedChoice('C:/a.FTC', {
            gameYear: 27,
            gameType: 'college'
        });
        expect(fs.writeJson).toHaveBeenCalledExactlyOnceWith(
            COMMON_FILE_CHOICES_FILENAME,
            { 'C:/a.FTC': { gameYear: 27, gameType: 'college' } }
        );
        expect(await getRememberedChoice('C:/a.FTC')).toEqual({
            gameYear: 27,
            gameType: 'college'
        });
        expect(await getRememberedChoice('C:/b.FTC')).toBeNull();
    });

    it('keeps other files when one is forgotten', async () => {
        stored = {
            'C:/a.FTC': { gameYear: 22, gameType: 'madden' },
            'C:/b.FTC': { gameYear: 25, gameType: 'madden' }
        };
        await setRememberedChoice('C:/a.FTC', null);
        expect(stored).toEqual({
            'C:/b.FTC': { gameYear: 25, gameType: 'madden' }
        });
    });

    it('skips the write when forgetting an unknown file', async () => {
        await setRememberedChoice('C:/a.FTC', null);
        expect(fs.writeJson).not.toHaveBeenCalled();
    });

    it('ignores invalid entries and unreadable files', async () => {
        stored = { 'C:/a.FTC': { gameYear: '22', gameType: 'madden' } };
        expect(await getRememberedChoice('C:/a.FTC')).toBeNull();
        stored = [];
        expect(await getRememberedChoice('C:/a.FTC')).toBeNull();
        fs.readJson.mockRejectedValueOnce(new Error('corrupt'));
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(await getRememberedChoice('C:/a.FTC')).toBeNull();
    });
});
