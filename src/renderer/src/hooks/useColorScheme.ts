import { useSyncExternalStore } from 'react';

export type ColorScheme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

const subscribe = (onChange: () => void) => {
    const media = window.matchMedia(QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
};

const getSnapshot = (): ColorScheme =>
    window.matchMedia(QUERY).matches ? 'dark' : 'light';

const useColorScheme = (): ColorScheme =>
    useSyncExternalStore(subscribe, getSnapshot);

export default useColorScheme;
