import { useCallback, useEffect, useState } from 'react';

// A preference from preferences.json, by "section.key" path. Uses `fallback`
// until the read resolves, or if the preference isn't set. Follows changes
// made anywhere (preferences:update).
export default function usePreference<T>(
    keyPath: string,
    fallback: T
): [T, (value: T) => void] {
    const [value, setStateValue] = useState<T>(fallback);

    useEffect(() => {
        let cancelled = false;
        // A change event is newer than the read, which may resolve after it
        let changed = false;
        window.electronAPI.preferences
            .getValue(keyPath)
            .then((stored) => {
                if (!cancelled && !changed && stored !== undefined) {
                    setStateValue(stored as T);
                }
            })
            .catch((error) =>
                console.error(`Failed to read preference ${keyPath}`, error)
            );

        const [section, key] = keyPath.split('.');
        const unsubscribe = window.electronAPI.preferences.onChanged?.(
            (prefs) => {
                const next = prefs?.[section]?.[key];
                if (next === undefined) return;
                changed = true;
                setStateValue(next as T);
            }
        );

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [keyPath]);

    const setValue = useCallback(
        (next: T) => {
            setStateValue(next);
            const [section, key] = keyPath.split('.');
            // preferences:set writes only the keys it is given
            window.electronAPI.preferences
                .set({ [section]: { [key]: next } })
                .catch((error) =>
                    console.error(`Failed to save preference ${keyPath}`, error)
                );
        },
        [keyPath]
    );

    return [value, setValue];
}
