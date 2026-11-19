import type {
    CellPosition,
    GridScroll
} from '@renderer/components/TableEditorComponent/TableEditorComponent';

// A table tab's back/forward history, as in a web browser (v4's
// TableEditorView.navSteps, plus forward). Pure, so every rule can be
// tested without React.

export interface HistoryEntry {
    tableId: number;
    // (record, field)
    selection: CellPosition;
    scroll?: GridScroll;
}

export interface TabHistory {
    entries: HistoryEntry[];
    // The current entry
    index: number;
}

// Where the user was on an entry when they left it
export type HistoryPlace = Pick<HistoryEntry, 'selection' | 'scroll'>;

export const MAX_HISTORY = 50;

export function startHistory(entry: HistoryEntry): TabHistory {
    return { entries: [entry], index: 0 };
}

// The entry being left keeps where the user was on it, as a browser saves
// the scroll position of the page you leave, so Back returns there.
function withPlace(h: TabHistory, from?: HistoryPlace): HistoryEntry[] {
    if (!from) {
        return h.entries;
    }
    return h.entries.map((entry, i) =>
        i === h.index
            ? { ...entry, selection: from.selection, scroll: from.scroll }
            : entry
    );
}

// Records `from` on the current entry, drops every forward entry, appends
// `entry`, and trims the oldest past MAX_HISTORY. The same table and cell as
// the current entry (a double click on a reference) is a no-op.
export function pushEntry(
    h: TabHistory,
    entry: HistoryEntry,
    from?: HistoryPlace
): TabHistory {
    const current = h.entries[h.index];
    if (
        current &&
        current.tableId === entry.tableId &&
        current.selection.row === entry.selection.row &&
        current.selection.col === entry.selection.col
    ) {
        return h;
    }
    const entries = [...withPlace(h, from).slice(0, h.index + 1), entry];
    const trimmed = entries.slice(-MAX_HISTORY);
    return { entries: trimmed, index: trimmed.length - 1 };
}

// Records `from` on the current entry and moves to `index` (clamped). The
// same object if the index doesn't change.
export function goTo(
    h: TabHistory,
    index: number,
    from?: HistoryPlace
): TabHistory {
    const target = Math.max(0, Math.min(index, h.entries.length - 1));
    if (target === h.index) {
        return h;
    }
    return { entries: withPlace(h, from), index: target };
}

export function canGoBack(h: TabHistory | undefined): boolean {
    return !!h && h.index > 0;
}

export function canGoForward(h: TabHistory | undefined): boolean {
    return !!h && h.index < h.entries.length - 1;
}

export interface IndexedEntry {
    index: number;
    entry: HistoryEntry;
}

// For the menus, nearest first (Chrome's order)
export function backEntries(h: TabHistory | undefined): IndexedEntry[] {
    if (!h) {
        return [];
    }
    return h.entries
        .slice(0, h.index)
        .map((entry, index) => ({ index, entry }))
        .reverse();
}

export function forwardEntries(h: TabHistory | undefined): IndexedEntry[] {
    if (!h) {
        return [];
    }
    return h.entries
        .slice(h.index + 1)
        .map((entry, i) => ({ index: h.index + 1 + i, entry }));
}
