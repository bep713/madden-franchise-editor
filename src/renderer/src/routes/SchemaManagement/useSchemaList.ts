import { useCallback, useEffect, useState } from 'react';
import type { SchemaEntry } from '@shared/types';

// The bundled and custom schemas, and the custom dir (<userData>/schemas)
export default function useSchemaList(): {
    entries: SchemaEntry[];
    schemaDir?: string;
    refresh: () => Promise<void>;
} {
    const [entries, setEntries] = useState<SchemaEntry[]>([]);
    const [schemaDir, setSchemaDir] = useState<string>();

    const refresh = useCallback(async (): Promise<void> => {
        try {
            setEntries(await window.franchiseAPI.getSavedSchemas());
        } catch (error) {
            await window.electronAPI.showMessageBox({
                type: 'error',
                message: 'Could not read the schema list.',
                detail: String(error)
            });
        }
    }, []);

    useEffect(() => {
        (async (): Promise<void> => {
            await refresh();
            try {
                setSchemaDir(await window.electronAPI.schema.initialize());
            } catch (error) {
                // Labels fall back to base names
                console.error('Failed to read the schema directory', error);
            }
        })();
    }, [refresh]);

    return { entries, schemaDir, refresh };
}
