import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SchemaField, SchemaFieldsSource } from '@shared/types';

export interface SchemaFieldsState {
    fields: SchemaField[];
    tableNames: ReadonlySet<string>;
    loading: boolean;
    error: string | null;
    retry: () => void;
}

export function sourceKey(source: SchemaFieldsSource): string {
    return 'path' in source ? `path:${source.path}` : `file:${source.fileId}`;
}

// Keeps the old fields while the next source loads, so the list doesn't
// flash empty. A response for a superseded request is dropped.
export function useSchemaFields(source: SchemaFieldsSource): SchemaFieldsState {
    // Primitives, so a new object with the same source doesn't refetch
    const path = 'path' in source ? source.path : null;
    const fileId = 'fileId' in source ? source.fileId : null;
    const [fields, setFields] = useState<SchemaField[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);
    const requestId = useRef(0);

    // Reset during render rather than in the effect
    const request = `${sourceKey(source)}#${attempt}`;
    const [started, setStarted] = useState(request);
    if (started !== request) {
        setStarted(request);
        setLoading(true);
        setError(null);
    }

    useEffect(() => {
        const id = ++requestId.current;
        const fail = (message: string): void => {
            setFields([]);
            setError(message);
        };
        window.electronAPI.schema
            .getFields(path !== null ? { path } : { fileId: fileId! })
            .then((result) => {
                if (id !== requestId.current) return;
                if ('error' in result) fail(result.error);
                else setFields(result.fields);
            })
            .catch((e: unknown) => {
                if (id !== requestId.current) return;
                fail(e instanceof Error ? e.message : String(e));
            })
            .finally(() => {
                if (id === requestId.current) setLoading(false);
            });
    }, [path, fileId, attempt]);

    const retry = useCallback(() => setAttempt((a) => a + 1), []);

    const tableNames = useMemo(
        () => new Set(fields.map((f) => f.table)),
        [fields]
    );

    return { fields, tableNames, loading, error, retry };
}
