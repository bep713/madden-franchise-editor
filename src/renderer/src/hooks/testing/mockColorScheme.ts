// jsdom has no matchMedia. This answers (prefers-color-scheme: dark) and lets
// a test flip it.
export const mockColorScheme = (initialDark: boolean) => {
    let dark = initialDark;
    const listeners = new Set<() => void>();
    window.matchMedia = ((query: string) => ({
        get matches() {
            return query === '(prefers-color-scheme: dark)' && dark;
        },
        media: query,
        addEventListener: (_: string, listener: () => void) =>
            listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
            listeners.delete(listener)
    })) as unknown as typeof window.matchMedia;
    return {
        setDark: (value: boolean) => {
            dark = value;
            listeners.forEach((listener) => listener());
        }
    };
};
