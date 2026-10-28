// Where a clicked table opens, as in a browser: a middle-click opens a
// background tab (with ctrl too, like Chrome), ctrl/cmd+click a new active tab
export type OpenMode = 'current' | 'newTab' | 'background';

export function getOpenMode(e: {
    button: number;
    ctrlKey: boolean;
    metaKey: boolean;
}): OpenMode {
    if (e.button === 1) {
        return 'background';
    }
    return e.ctrlKey || e.metaKey ? 'newTab' : 'current';
}
