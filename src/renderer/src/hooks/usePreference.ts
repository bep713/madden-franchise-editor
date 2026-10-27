import { useCallback, useEffect, useState } from 'react';

// A preference from preferences.json, by "section.key" path. Uses `fallback`
// until the read resolves, or if the preference isn't set.
export default function usePreference<T>(
    keyPath: string,
    fallback: T
): [T, (value: T) => void] {
    const [value, setStateValue] = useState<T>(fallback);

    useEffect(() => {
        let cancelled = false;
        window.electronAPI.preferences
            .getValue(keyPath)
            .then((stored) => {
                if (!cancelled && stored !== undefined) {
                    setStateValue(stored as T);
                }
            })
            .catch((error) =>
                console.error(`Failed to read preference ${keyPath}`, error)
            );

        return () => {
            cancelled = true;
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
