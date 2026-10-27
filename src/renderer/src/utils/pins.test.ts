import { describe, expect, it } from 'vitest';
import { PinsFile } from '@shared/types';
import {
    addPin,
    getInitialPins,
    getPinnedTables,
    preparePins,
    removePin
} from './pins';

const PLAYER = { id: 4220, uniqueId: 1612938518, name: 'Player' };
const TEAM = { id: 7388, uniqueId: 222, name: 'Team' };
const LEAGUE = { id: 4269, uniqueId: 333, name: 'League' };
const FRANCHISE = { id: 4688, uniqueId: 444, name: 'Franchise' };
const OVERALL = { id: 999, uniqueId: 4079666669, name: 'OverallPercentage' };
const TABLES = [PLAYER, TEAM, LEAGUE, FRANCHISE, OVERALL];

const M22 = { gameYear: 22, gameType: 'madden' };

const group = (pins: PinsFile[number]['pins'], gameYear = 22) => ({
    gameYear,
    gameType: 'madden',
    pins
});

describe('preparePins', () => {
    it('starts from the defaults, with uniqueIds filled in, if there is no file', () => {
        const { allPins, changed } = preparePins(null, 22, 'madden', TABLES);
        expect(changed).toBe(true);
        expect(allPins.find((g) => g.gameYear === 22)?.pins).toEqual([
            { tableId: 4220, tableName: 'Player', uniqueId: PLAYER.uniqueId },
            { tableId: 7388, tableName: 'Team', uniqueId: TEAM.uniqueId },
            {
                tableId: 4688,
                tableName: 'Franchise',
                uniqueId: FRANCHISE.uniqueId
            },
            { tableId: 4269, tableName: 'League', uniqueId: LEAGUE.uniqueId }
        ]);
        expect(allPins.map((g) => g.gameYear)).toEqual([22, 21, 20]);
    });

    it('reports no change for an up-to-date file and never mutates it', () => {
        const file = [
            group([
                {
                    tableId: 4220,
                    tableName: 'Player',
                    uniqueId: PLAYER.uniqueId
                }
            ])
        ];
        const copy = structuredClone(file);
        const { allPins, changed } = preparePins(file, 22, 'madden', TABLES);
        expect(changed).toBe(false);
        expect(allPins).toEqual(copy);
        expect(allPins).not.toBe(file);
    });

    it('updates the tableId of a uniqueId pin whose table moved, keeping the uniqueId', () => {
        const file = [
            group([
                {
                    tableId: 9999,
                    tableName: 'Player',
                    uniqueId: PLAYER.uniqueId
                }
            ])
        ];
        const { allPins, changed } = preparePins(file, 22, 'madden', TABLES);
        expect(changed).toBe(true);
        expect(allPins[0].pins[0]).toEqual({
            tableId: 4220,
            tableName: 'Player',
            uniqueId: PLAYER.uniqueId
        });
    });

    it('keeps a uniqueId pin with no matching table, and never matches it by tableId', () => {
        const file = [
            group([{ tableId: 4220, tableName: 'Gone', uniqueId: 1 }])
        ];
        const { allPins, changed } = preparePins(file, 22, 'madden', TABLES);
        expect(changed).toBe(false);
        expect(allPins[0].pins).toEqual(file[0].pins);
        expect(getPinnedTables(allPins[0].pins, TABLES)).toEqual([]);
    });

    it('gives a legacy pin a uniqueId by id and name', () => {
        const file = [group([{ tableId: 4220, tableName: 'Player' }])];
        const { allPins } = preparePins(file, 22, 'madden', TABLES);
        expect(allPins[0].pins[0].uniqueId).toBe(PLAYER.uniqueId);
    });

    it('gives a legacy pin a uniqueId by a unique name', () => {
        const file = [group([{ tableId: 1, tableName: 'Player' }])];
        const { allPins } = preparePins(file, 22, 'madden', TABLES);
        expect(allPins[0].pins[0]).toEqual({
            tableId: 4220,
            tableName: 'Player',
            uniqueId: PLAYER.uniqueId
        });
    });

    it('leaves a legacy pin unmatched if its name is ambiguous', () => {
        const tables = [...TABLES, { id: 5000, uniqueId: 555, name: 'Player' }];
        const file = [group([{ tableId: 1, tableName: 'Player' }])];
        const { allPins, changed } = preparePins(file, 22, 'madden', tables);
        expect(changed).toBe(false);
        expect(allPins[0].pins[0]).toEqual({ tableId: 1, tableName: 'Player' });
    });

    it('leaves a legacy pin unmatched if its id now belongs to a table with another name', () => {
        const tables = [
            { id: 4220, uniqueId: 9, name: 'Other' },
            { id: 1, uniqueId: 10, name: 'Player' },
            { id: 2, uniqueId: 11, name: 'Player' }
        ];
        const file = [group([{ tableId: 4220, tableName: 'Player' }])];
        const { allPins } = preparePins(file, 22, 'madden', tables);
        expect(allPins[0].pins[0]).toEqual({
            tableId: 4220,
            tableName: 'Player'
        });
    });

    it('migrates untyped groups up to 27 to madden', () => {
        const file = [
            { gameYear: 25, pins: [] },
            { gameYear: 22, pins: [] }
        ];
        const { allPins, changed } = preparePins(file, 22, 'madden', []);
        expect(changed).toBe(true);
        expect(allPins.map((g) => g.gameType)).toEqual(['madden', 'madden']);
    });

    it('gives an untyped later group the type of the opened file only if no typed group exists', () => {
        const untyped = [
            { gameYear: 27, pins: [] },
            { gameYear: 28, pins: [] }
        ];
        expect(
            preparePins(untyped, 28, 'cfb', []).allPins.map((g) => g.gameType)
        ).toEqual(['madden', 'cfb']);

        const typed = [
            { gameYear: 28, pins: [] },
            { gameYear: 28, gameType: 'cfb', pins: [] }
        ];
        const { allPins } = preparePins(typed, 28, 'cfb', []);
        expect(allPins.map((g) => g.gameType)).toEqual([undefined, 'cfb']);
    });

    it('adds an empty group for a year with no default', () => {
        const { allPins, changed } = preparePins([], 25, undefined, []);
        expect(changed).toBe(true);
        expect(allPins).toEqual([
            { gameYear: 25, gameType: 'madden', pins: [] }
        ]);
    });

    it('round-trips a pins.json written by v4 with the same shape', () => {
        // As v4's pinnedTableService wrote it for a game type split file
        const v4File: PinsFile = JSON.parse(
            JSON.stringify([
                {
                    gameYear: 22,
                    gameType: 'madden',
                    pins: [
                        {
                            tableId: 4220,
                            tableName: 'Player',
                            uniqueId: PLAYER.uniqueId
                        },
                        {
                            tableId: 999,
                            tableName: 'OverallPercentage',
                            uniqueId: OVERALL.uniqueId
                        }
                    ]
                },
                {
                    gameYear: 21,
                    gameType: 'madden',
                    pins: [{ tableId: 4226, tableName: 'Player' }]
                }
            ])
        );
        const { allPins, changed } = preparePins(v4File, 22, 'madden', TABLES);
        expect(changed).toBe(false);
        expect(JSON.parse(JSON.stringify(allPins))).toEqual(v4File);
    });
});

describe('getPinnedTables', () => {
    it('sorts numerically and drops duplicates', () => {
        const pins = [
            { tableId: 4220, tableName: 'Player', uniqueId: PLAYER.uniqueId },
            { tableId: 999, tableName: 'OverallPercentage' },
            { tableId: 4220, tableName: 'Player' }
        ];
        expect(getPinnedTables(pins, TABLES)).toEqual([OVERALL, PLAYER]);
    });
});

describe('addPin / removePin', () => {
    const start: PinsFile = [
        group([
            { tableId: 4220, tableName: 'Player', uniqueId: PLAYER.uniqueId }
        ])
    ];

    it('adds a pin without mutating the input', () => {
        const next = addPin(start, M22, TEAM);
        expect(next[0].pins).toEqual([
            start[0].pins[0],
            { tableId: 7388, tableName: 'Team', uniqueId: TEAM.uniqueId }
        ]);
        expect(start[0].pins).toHaveLength(1);
    });

    it('does nothing if the table is already pinned', () => {
        expect(addPin(start, M22, PLAYER)).toBe(start);
    });

    it('drops a uniqueId of 0', () => {
        const next = addPin(start, M22, { id: 1, uniqueId: 0, name: 'X' });
        expect(next[0].pins[1]).toEqual({ tableId: 1, tableName: 'X' });
    });

    it('adds a group if the key has none', () => {
        const next = addPin([], M22, TEAM);
        expect(next).toEqual([
            group([
                { tableId: 7388, tableName: 'Team', uniqueId: TEAM.uniqueId }
            ])
        ]);
    });

    it('removes only the matching pin, in the matching group', () => {
        const all = [
            ...addPin(start, M22, TEAM),
            ...getInitialPins().filter((g) => g.gameYear === 21)
        ];
        const next = removePin(all, M22, PLAYER);
        expect(next[0].pins).toEqual([
            { tableId: 7388, tableName: 'Team', uniqueId: TEAM.uniqueId }
        ]);
        expect(next[1]).toBe(all[1]);
    });
});
