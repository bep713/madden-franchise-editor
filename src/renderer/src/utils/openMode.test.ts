import { describe, expect, it } from 'vitest';
import { getOpenMode } from './openMode';

const click = (button: number, ctrlKey = false, metaKey = false) => ({
    button,
    ctrlKey,
    metaKey
});

describe('getOpenMode', () => {
    it.each([
        ['plain', click(0), 'current'],
        ['ctrl', click(0, true), 'newTab'],
        ['meta', click(0, false, true), 'newTab'],
        ['middle', click(1), 'background'],
        ['ctrl+middle', click(1, true), 'background']
    ])('%s click', (_, event, mode) => {
        expect(getOpenMode(event)).toBe(mode);
    });
});
