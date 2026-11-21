import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import usePreference from './usePreference';

const getValue = vi.fn();
const set = vi.fn();
let listeners: ((prefs: Record<string, Record<string, unknown>>) => void)[] =
    [];
const onChanged = vi.fn(
    (callback: (prefs: Record<string, Record<string, unknown>>) => void) => {
        listeners.push(callback);
        return () => {
            listeners = listeners.filter((l) => l !== callback);
        };
    }
);

beforeEach(() => {
    getValue.mockReset();
    listeners = [];
    set.mockReset().mockResolvedValue(undefined);
    window.electronAPI = {
        preferences: { getValue, set, onChanged }
    } as unknown as Window['electronAPI'];
});

describe('usePreference', () => {
    it('follows preferences:update, and unsubscribes on unmount', async () => {
        getValue.mockResolvedValue([]);
        const { result, unmount } = renderHook(() =>
            usePreference<unknown>('general.autoSave', false)
        );
        await act(async () => {});
        expect(result.current[0]).toEqual([]);

        act(() =>
            listeners.forEach((l) => l({ general: { autoSave: [true] } }))
        );
        expect(result.current[0]).toEqual([true]);
        // other keys leave it alone
        act(() => listeners.forEach((l) => l({ other: {} })));
        expect(result.current[0]).toEqual([true]);

        unmount();
        expect(listeners).toHaveLength(0);
    });

    it('a read that resolves after a change does not undo it', async () => {
        let resolve: (value: unknown) => void = () => {};
        getValue.mockReturnValue(new Promise((r) => (resolve = r)));
        const { result } = renderHook(() => usePreference<unknown>('a.b', 0));
        act(() => listeners.forEach((l) => l({ a: { b: 2 } })));
        await act(async () => resolve(1));
        expect(result.current[0]).toBe(2);
    });

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
