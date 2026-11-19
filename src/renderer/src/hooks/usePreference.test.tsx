import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePreference from './usePreference';

const getValue = vi.fn();
const set = vi.fn();

beforeEach(() => {
    getValue.mockReset();
    set.mockReset().mockResolvedValue(undefined);
    window.electronAPI = {
        preferences: { getValue, set }
    } as unknown as Window['electronAPI'];
});

describe('usePreference', () => {
    it('starts at the fallback, then takes the stored value', async () => {
        let resolve: (value: unknown) => void = () => {};
        getValue.mockReturnValue(new Promise((r) => (resolve = r)));
        const { result } = renderHook(() =>
            usePreference('tableEditor.showPinnedTables', true)
        );
        expect(result.current[0]).toBe(true);
        expect(getValue).toHaveBeenCalledWith('tableEditor.showPinnedTables');

        await act(async () => resolve(false));
        expect(result.current[0]).toBe(false);
    });

    it('keeps the fallback if the preference is not set', async () => {
        getValue.mockResolvedValue(undefined);
        const { result } = renderHook(() => usePreference('a.b', 5));
        await waitFor(() => expect(getValue).toHaveBeenCalled());
        await act(async () => {});
        expect(result.current[0]).toBe(5);
    });

    it('setValue updates state and sends only that key', async () => {
        getValue.mockResolvedValue(true);
        const { result } = renderHook(() =>
            usePreference('tableEditor.showPinnedTables', true)
        );
        await act(async () => {});

        act(() => result.current[1](false));
        expect(result.current[0]).toBe(false);
        expect(set).toHaveBeenCalledWith({
            tableEditor: { showPinnedTables: false }
        });
    });
});
