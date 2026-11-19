import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    SchemaField,
    SchemaFieldsResult,
    SchemaFieldsSource
} from '@shared/types';
import { useSchemaFields } from './useSchemaFields';

const FIELDS: SchemaField[] = [
    { name: 'FirstName', table: 'Player', type: 'string' },
    { name: 'Team', table: 'Player', type: 'Team' },
    { name: 'Name', table: 'Team', type: 'string' }
];

const ok = (fields: SchemaField[]): SchemaFieldsResult => ({
    meta: null,
    fields
});

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

const getFields = vi.fn();

beforeEach(() => {
    getFields.mockReset();
    window.electronAPI = {
        schema: { getFields }
    } as unknown as Window['electronAPI'];
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('useSchemaFields', () => {
    it('loads the fields', async () => {
        getFields.mockResolvedValue(ok(FIELDS));
        const { result } = renderHook(() => useSchemaFields({ path: 'a.gz' }));
        expect(result.current.loading).toBe(true);
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.fields).toEqual(FIELDS);
        expect(result.current.error).toBeNull();
        expect(getFields).toHaveBeenCalledWith({ path: 'a.gz' });
    });

    it('sets error from an { error } result', async () => {
        getFields.mockResolvedValue({ error: 'bad schema' });
        const { result } = renderHook(() => useSchemaFields({ path: 'a.gz' }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('bad schema');
        expect(result.current.fields).toEqual([]);
    });

    it('sets error when the call throws', async () => {
        getFields.mockRejectedValue(new Error('ipc failed'));
        const { result } = renderHook(() => useSchemaFields({ fileId: 'f1' }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect(result.current.error).toBe('ipc failed');
        expect(result.current.fields).toEqual([]);
    });

    it('retry refetches', async () => {
        getFields.mockResolvedValueOnce({ error: 'bad' });
        getFields.mockResolvedValueOnce(ok(FIELDS));
        const { result } = renderHook(() => useSchemaFields({ path: 'a.gz' }));
        await waitFor(() => expect(result.current.error).toBe('bad'));
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.fields).toEqual(FIELDS));
        expect(result.current.error).toBeNull();
        expect(getFields).toHaveBeenCalledTimes(2);
    });

    it('ignores a slow response for a superseded source', async () => {
        const slow = deferred<SchemaFieldsResult>();
        const fast = deferred<SchemaFieldsResult>();
        getFields
            .mockReturnValueOnce(slow.promise)
            .mockReturnValueOnce(fast.promise);
        const { result, rerender } = renderHook(
            ({ source }: { source: SchemaFieldsSource }) =>
                useSchemaFields(source),
            { initialProps: { source: { path: 'a.gz' } } }
        );
        rerender({ source: { path: 'b.gz' } });
        const second = [FIELDS[2]];
        await act(async () => fast.resolve(ok(second)));
        expect(result.current.fields).toEqual(second);
        await act(async () => slow.resolve(ok(FIELDS)));
        expect(result.current.fields).toEqual(second);
        expect(result.current.loading).toBe(false);
    });

    it('keeps the old fields while the next source loads', async () => {
        const next = deferred<SchemaFieldsResult>();
        getFields
            .mockResolvedValueOnce(ok(FIELDS))
            .mockReturnValueOnce(next.promise);
        const { result, rerender } = renderHook(
            ({ source }: { source: SchemaFieldsSource }) =>
                useSchemaFields(source),
            { initialProps: { source: { path: 'a.gz' } } }
        );
        await waitFor(() => expect(result.current.fields).toEqual(FIELDS));
        rerender({ source: { path: 'b.gz' } });
        expect(result.current.loading).toBe(true);
        expect(result.current.fields).toEqual(FIELDS);
        await act(async () => next.resolve(ok([])));
    });

    it('does not refetch for the same source in a new object', async () => {
        getFields.mockResolvedValue(ok(FIELDS));
        const { result, rerender } = renderHook(
            ({ source }: { source: SchemaFieldsSource }) =>
                useSchemaFields(source),
            { initialProps: { source: { path: 'a.gz' } } }
        );
        await waitFor(() => expect(result.current.loading).toBe(false));
        rerender({ source: { path: 'a.gz' } });
        expect(result.current.loading).toBe(false);
        expect(getFields).toHaveBeenCalledTimes(1);
    });

    it('builds tableNames from the fields', async () => {
        getFields.mockResolvedValue(ok(FIELDS));
        const { result } = renderHook(() => useSchemaFields({ path: 'a.gz' }));
        await waitFor(() => expect(result.current.loading).toBe(false));
        expect([...result.current.tableNames].sort()).toEqual([
            'Player',
            'Team'
        ]);
    });
});
