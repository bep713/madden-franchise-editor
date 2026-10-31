import { describe, expect, it } from 'vitest';
import {
    HistoryEntry,
    MAX_HISTORY,
    TabHistory,
    backEntries,
    canGoBack,
    canGoForward,
    forwardEntries,
    goTo,
    pushEntry,
    startHistory
} from './tabHistory';

const at = (tableId: number, row = 0, col = 0): HistoryEntry => ({
    tableId,
    selection: { row, col }
});

// 4096 -> 4097 -> 4098, on 4098
const threeTables = (): TabHistory =>
    [at(4097), at(4098)].reduce(
        (h, entry) => pushEntry(h, entry),
        startHistory(at(4096))
    );

const ids = (h: TabHistory) => h.entries.map((e) => e.tableId);

describe('tabHistory', () => {
    it('starts with one entry and nowhere to go', () => {
        const h = startHistory(at(4096));
        expect(h).toEqual({ entries: [at(4096)], index: 0 });
        expect(canGoBack(h)).toBe(false);
        expect(canGoForward(h)).toBe(false);
        expect(canGoBack(undefined)).toBe(false);
        expect(canGoForward(undefined)).toBe(false);
    });

    it('appends a pushed entry and moves to it', () => {
        const h = threeTables();
        expect(ids(h)).toEqual([4096, 4097, 4098]);
        expect(h.index).toBe(2);
        expect(canGoBack(h)).toBe(true);
        expect(canGoForward(h)).toBe(false);
    });

    it('drops the forward entries on a push from the middle', () => {
        const h = pushEntry(goTo(threeTables(), 0), at(7482));
        expect(ids(h)).toEqual([4096, 7482]);
        expect(h.index).toBe(1);
        expect(canGoForward(h)).toBe(false);
    });

    it('writes `from` into the entry being left', () => {
        const from = {
            selection: { row: 5, col: 2 },
            scroll: { top: 9, left: 3 }
        };
        const pushed = pushEntry(startHistory(at(4096)), at(4097), from);
        expect(pushed.entries[0]).toEqual({ tableId: 4096, ...from });

        const back = goTo(pushed, 0, { selection: { row: 1, col: 1 } });
        expect(back.entries[1]).toEqual({
            tableId: 4097,
            selection: { row: 1, col: 1 },
            scroll: undefined
        });
        expect(back.entries[0]).toEqual({ tableId: 4096, ...from });
    });

    it('ignores a push of the current table and cell', () => {
        const h = threeTables();
        expect(pushEntry(h, at(4098))).toBe(h);
        expect(ids(pushEntry(h, at(4098, 3)))).toEqual([
            4096, 4097, 4098, 4098
        ]);
    });

    it('drops the oldest entry past MAX_HISTORY', () => {
        let h = startHistory(at(0));
        for (let i = 1; i <= MAX_HISTORY; i++) {
            h = pushEntry(h, at(i));
        }
        expect(h.entries).toHaveLength(MAX_HISTORY);
        expect(h.entries[0].tableId).toBe(1);
        expect(h.index).toBe(MAX_HISTORY - 1);
    });

    it('clamps goTo and returns the same object when the index is unchanged', () => {
        const h = threeTables();
        expect(goTo(h, 2)).toBe(h);
        expect(goTo(h, 9)).toBe(h);
        expect(goTo(h, -4).index).toBe(0);
        expect(goTo(h, 1).index).toBe(1);
    });

    it('lists back and forward entries nearest first', () => {
        const h = goTo(pushEntry(threeTables(), at(4104)), 1);
        expect(backEntries(h)).toEqual([{ index: 0, entry: at(4096) }]);
        expect(forwardEntries(h)).toEqual([
            { index: 2, entry: at(4098) },
            { index: 3, entry: at(4104) }
        ]);
        expect(backEntries(threeTables()).map((e) => e.index)).toEqual([1, 0]);
        expect(backEntries(undefined)).toEqual([]);
        expect(forwardEntries(undefined)).toEqual([]);
    });
});
