import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import useColorScheme from './useColorScheme';
import { mockColorScheme } from './testing/mockColorScheme';

const original = window.matchMedia;

afterEach(() => {
    window.matchMedia = original;
});

describe('useColorScheme', () => {
    it('reads the current scheme', () => {
        mockColorScheme(true);
        const { result } = renderHook(() => useColorScheme());
        expect(result.current).toBe('dark');
    });

    it('follows a change of the system scheme', () => {
        const media = mockColorScheme(false);
        const { result } = renderHook(() => useColorScheme());
        expect(result.current).toBe('light');

        act(() => media.setDark(true));
        expect(result.current).toBe('dark');

        act(() => media.setDark(false));
        expect(result.current).toBe('light');
    });
});
