import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    AddSchemaOverrides,
    AddSchemaPlan,
    AddSchemaRequest,
    AddSchemaResult,
    AddedSchema
} from '@shared/types';
import { confirm } from '@renderer/utils/confirm';
import {
    EMPTY_REQUEST,
    addPaths,
    confirmation,
    removePaths,
    sameFiles,
    withEntry
} from './addSchemaModel';

// Typing in an option box re-plans after this pause; other changes re-plan now
export const OPTION_DEBOUNCE_MS = 250;

export type OverridePatch = {
    [K in keyof AddSchemaOverrides]: AddSchemaOverrides[K] | undefined;
};

export interface UseAddSchema {
    request: AddSchemaRequest;
    // null before the first reply and when there are no files
    plan: AddSchemaPlan | null;
    // A newer plan is on its way
    inspecting: boolean;
    // Files were just added and main is still reading them. The page blocks
    // for this one, since a big folder takes seconds.
    reading: boolean;
    adding: boolean;
    // The last inspect failed
    error: string | null;
    addFiles: (paths: string[]) => void;
    removeFiles: (paths: string[]) => void;
    // undefined goes back to the detected entry
    setEntry: (path: string | undefined) => void;
    browse: (kind: 'files' | 'folder') => Promise<void>;
    // `typed`: from a Textbox, so it waits for a pause
    setOverrides: (patch: OverridePatch, typed?: boolean) => void;
    setIncludeDefaults: (value: boolean) => void;
    // The added schema, or null when cancelled, blocked or failed
    add: () => Promise<AddedSchema | null>;
}

function withPatch(
    overrides: AddSchemaOverrides,
    patch: OverridePatch
): AddSchemaOverrides {
    const next: AddSchemaOverrides = { ...overrides, ...patch };
    for (const key of Object.keys(next) as (keyof AddSchemaOverrides)[]) {
        if (next[key] === undefined) delete next[key];
    }
    return next;
}

// The page's request, and main's plan for it. Inspects run from the event
// that changed the request, never from an effect, and a reply for an older
// request is dropped by its sequence number.
export default function useAddSchema(): UseAddSchema {
    const [request, setRequestState] =
        useState<AddSchemaRequest>(EMPTY_REQUEST);
    const [plan, setPlan] = useState<AddSchemaPlan | null>(null);
    const [inspecting, setInspecting] = useState(false);
    const [reading, setReading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Handlers read these at call time, so two changes in one tick compose
    const requestRef = useRef(request);
    const seq = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    const addingRef = useRef(false);

    useEffect(
        () => () => {
            clearTimeout(timer.current);
            seq.current++;
        },
        []
    );

    const setRequest = useCallback((next: AddSchemaRequest) => {
        requestRef.current = next;
        setRequestState(next);
    }, []);

    const run = useCallback(
        async (next: AddSchemaRequest, mine: number) => {
            let result: AddSchemaPlan | { error: string };
            try {
                result = await window.electronAPI.schema.inspectAdd(next);
            } catch (e) {
                result = { error: String(e) };
            }
            if (mine !== seq.current) return;
            setInspecting(false);
            setReading(false);
            if ('error' in result) {
                setError(result.error);
                setPlan(null);
                return;
            }
            setError(null);
            setPlan(result);
            // A folder comes back as its files, each removable on its own
            const paths = result.files.map((file) => file.path);
            if (!sameFiles(paths, next.files)) {
                setRequest({ ...requestRef.current, files: paths });
            }
        },
        [setRequest]
    );

    const inspect = useCallback(
        (next: AddSchemaRequest, delay: number) => {
            clearTimeout(timer.current);
            const mine = ++seq.current;
            if (!next.files.length) {
                setInspecting(false);
                setReading(false);
                setError(null);
                setPlan(null);
                return;
            }
            setInspecting(true);
            if (delay) {
                timer.current = setTimeout(() => void run(next, mine), delay);
            } else {
                void run(next, mine);
            }
        },
        [run]
    );

    const change = useCallback(
        (update: (r: AddSchemaRequest) => AddSchemaRequest, delay = 0) => {
            const next = update(requestRef.current);
            setRequest(next);
            inspect(next, delay);
        },
        [inspect, setRequest]
    );

    const addFiles = useCallback(
        (paths: string[]) => {
            const files = addPaths(requestRef.current.files, paths);
            if (files.length === requestRef.current.files.length) return;
            setReading(true);
            change((r) => ({ ...r, files }));
        },
        [change]
    );

    const removeFiles = useCallback(
        (paths: string[]) =>
            change((r) => {
                const files = removePaths(r.files, paths);
                // Removing the chosen entry goes back to the detected one
                const kept =
                    r.entry !== undefined &&
                    removePaths([r.entry], files).length === 0;
                return withEntry({ ...r, files }, kept ? r.entry : undefined);
            }),
        [change]
    );

    const setEntry = useCallback(
        (path: string | undefined) => change((r) => withEntry(r, path)),
        [change]
    );

    const browse = useCallback(
        async (kind: 'files' | 'folder') => {
            // A failed read opens the dialog in Electron's last folder
            const defaultPath = await window.electronAPI.preferences
                .getValue('general.defaultDirectory')
                .catch(() => undefined);
            const result = await window.electronAPI.showOpenDialog({
                title:
                    kind === 'files'
                        ? 'Choose schema files'
                        : 'Choose a folder of schema files',
                ...(typeof defaultPath === 'string' &&
                    defaultPath && { defaultPath }),
                properties:
                    kind === 'files'
                        ? ['openFile', 'multiSelections']
                        : ['openDirectory'],
                ...(kind === 'files' && {
                    filters: [
                        {
                            name: 'Schema files',
                            extensions: ['ftx', 'xml', 'gz']
                        },
                        { name: 'All files', extensions: ['*'] }
                    ]
                })
            });
            if (!result.canceled && result.filePaths.length) {
                addFiles(result.filePaths);
            }
        },
        [addFiles]
    );

    const setOverrides = useCallback(
        (patch: OverridePatch, typed = false) =>
            change(
                (r) => ({ ...r, overrides: withPatch(r.overrides, patch) }),
                typed ? OPTION_DEBOUNCE_MS : 0
            ),
        [change]
    );

    const setIncludeDefaults = useCallback(
        (value: boolean) => change((r) => ({ ...r, includeDefaults: value })),
        [change]
    );

    const add = async (): Promise<AddedSchema | null> => {
        const target = plan?.target;
        if (!plan?.canAdd || !target || inspecting || addingRef.current) {
            return null;
        }
        addingRef.current = true;
        try {
            const ask = confirmation(plan);
            if (ask && !(await confirm(ask.message, ask.detail, ask.button))) {
                return null;
            }
            setAdding(true);
            const mine = ++seq.current;
            let result: AddSchemaResult;
            try {
                result = await window.electronAPI.schema.add({
                    ...requestRef.current,
                    acceptMissing: plan.missing,
                    confirmedTarget: {
                        fileName: target.fileName,
                        replaces: target.replaces.map((r) => r.path)
                    }
                });
            } catch (e) {
                result = { error: String(e) };
            }
            setAdding(false);
            if ('error' in result) {
                await window.electronAPI.showMessageBox({
                    type: 'error',
                    message: 'Could not add the schema.',
                    detail: result.error
                });
                return null;
            }
            if (result.status === 'blocked') {
                if (mine === seq.current) setPlan(result.plan);
                return null;
            }
            return result.added;
        } finally {
            addingRef.current = false;
        }
    };

    return {
        request,
        plan,
        inspecting,
        reading,
        adding,
        error,
        addFiles,
        removeFiles,
        setEntry,
        browse,
        setOverrides,
        setIncludeDefaults,
        add
    };
}
