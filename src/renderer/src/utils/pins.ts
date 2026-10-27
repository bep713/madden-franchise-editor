// TypeScript port of v4's renderer/js/services/pinnedTableService.js, as pure
// functions. v4 still uses its own copy, so keep both in step if either changes.
//
// Pins are keyed by the table's uniqueId, which stays stable across saves and
// game updates. tableId is kept as a fallback key for pins without a uniqueId
// (legacy pins, or tables whose uniqueId is 0) and as a last-known id hint.
import { Pin, PinGroup, PinsFile, TableListItem } from '@shared/types';

export const PINS_FILENAME = 'pins.json';
// madden-franchise GAME_TYPE values
const GAME_TYPE_MADDEN = 'madden';
// pins.json entries written before gameType existed are Madden up to this year
const LAST_MADDEN_ONLY_YEAR = 27;

export type PinnableTable = Pick<TableListItem, 'id' | 'uniqueId' | 'name'>;

export interface PinGroupKey {
    gameYear: number;
    gameType: string;
}

export function getInitialPins(): PinsFile {
    return [
        {
            gameYear: 22,
            gameType: GAME_TYPE_MADDEN,
            pins: [
                { tableId: 4220, tableName: 'Player' },
                { tableId: 7388, tableName: 'Team' },
                { tableId: 4688, tableName: 'Franchise' },
                { tableId: 4269, tableName: 'League' }
            ]
        },
        {
            gameYear: 21,
            gameType: GAME_TYPE_MADDEN,
            pins: [
                { tableId: 4226, tableName: 'Player' },
                { tableId: 7708, tableName: 'Team' },
                { tableId: 4680, tableName: 'Franchise' },
                { tableId: 4278, tableName: 'League' }
            ]
        },
        {
            gameYear: 20,
            gameType: GAME_TYPE_MADDEN,
            pins: [
                { tableId: 4240, tableName: 'Player' },
                { tableId: 7890, tableName: 'Team' },
                { tableId: 4687, tableName: 'Franchise' },
                { tableId: 4294, tableName: 'League' }
            ]
        }
    ];
}

export function findPinGroup(
    allPins: PinsFile,
    { gameYear, gameType }: PinGroupKey
): PinGroup | undefined {
    return allPins.find(
        (group) => group.gameYear === gameYear && group.gameType === gameType
    );
}

/**
 * Adds a gameType to groups written before pins were split by game type, in
 * place. Years up to 27 were Madden only. Later years are ambiguous, so an
 * untyped group takes the type of the first file opened for its year.
 * @returns whether any group changed
 */
export function migrateGameTypes(allPins: PinsFile, key: PinGroupKey): boolean {
    let changed = false;

    allPins.forEach((group) => {
        if (group.gameType) return;

        if (group.gameYear <= LAST_MADDEN_ONLY_YEAR) {
            group.gameType = GAME_TYPE_MADDEN;
            changed = true;
        } else if (
            group.gameYear === key.gameYear &&
            !findPinGroup(allPins, key)
        ) {
            group.gameType = key.gameType;
            changed = true;
        }
    });

    return changed;
}

/**
 * Fills in uniqueId on pins that lack one and refreshes the tableId hint on
 * pins that have one, in place. Pins that can't be matched safely are left
 * untouched, and a uniqueId is never rewritten.
 * @returns whether any pin changed
 */
export function migratePins(pins: Pin[], tables: PinnableTable[]): boolean {
    const byUniqueId = new Map<number, PinnableTable>();
    const byTableId = new Map<number, PinnableTable>();
    const byName = new Map<string, PinnableTable[]>();

    tables.forEach((table) => {
        if (table.uniqueId) byUniqueId.set(table.uniqueId, table);
        byTableId.set(table.id, table);
        byName.set(table.name, (byName.get(table.name) ?? []).concat(table));
    });

    let changed = false;

    pins.forEach((pin) => {
        let table: PinnableTable | undefined;

        if (pin.uniqueId) {
            table = byUniqueId.get(pin.uniqueId);
        } else {
            // Only trust the old tableId if it still points at a table of the same name
            const tableById = byTableId.get(pin.tableId);
            if (tableById?.uniqueId && tableById.name === pin.tableName) {
                table = tableById;
            } else {
                const tablesWithName = byName.get(pin.tableName) ?? [];
                if (tablesWithName.length === 1 && tablesWithName[0].uniqueId) {
                    table = tablesWithName[0];
                }
            }

            if (table) {
                pin.uniqueId = table.uniqueId;
                changed = true;
            }
        }

        if (table && pin.tableId !== table.id) {
            pin.tableId = table.id;
            changed = true;
        }
    });

    return changed;
}

/**
 * Returns the table the pin points at in the open file, or null. A pin with a
 * uniqueId never falls back to its tableId, because that id may now belong to
 * an unrelated table.
 */
export function resolvePin<T extends PinnableTable>(
    pin: Pin,
    tables: T[]
): T | null {
    if (pin.uniqueId) {
        return tables.find((table) => table.uniqueId === pin.uniqueId) ?? null;
    }

    return tables.find((table) => table.id === pin.tableId) ?? null;
}

export function pinMatches(pin: Pin, table: PinnableTable): boolean {
    if (pin.uniqueId && table.uniqueId) {
        return pin.uniqueId === table.uniqueId;
    }

    return !pin.uniqueId && pin.tableId === table.id;
}

/**
 * What v4's initialize does on file open: defaults for a missing file, the
 * gameType migration, a group for this year, then migratePins. Works on a
 * copy, so the input is never mutated.
 * @returns the pins and whether they differ from what was read
 */
export function preparePins(
    readPins: PinsFile | null,
    gameYear: number,
    gameType: string | undefined,
    tables: PinnableTable[]
): { allPins: PinsFile; changed: boolean } {
    const key = { gameYear, gameType: gameType || GAME_TYPE_MADDEN };
    const allPins = readPins ? structuredClone(readPins) : getInitialPins();
    let changed = !readPins;

    if (migrateGameTypes(allPins, key)) {
        changed = true;
    }

    let group = findPinGroup(allPins, key);
    if (!group) {
        group = findPinGroup(getInitialPins(), key) ?? { ...key, pins: [] };
        allPins.push(group);
        changed = true;
    }

    if (migratePins(group.pins, tables)) {
        changed = true;
    }

    return { allPins, changed };
}

function updateGroupPins(
    allPins: PinsFile,
    key: PinGroupKey,
    update: (pins: Pin[]) => Pin[]
): PinsFile {
    const group = findPinGroup(allPins, key);
    if (!group) {
        return [...allPins, { ...key, pins: update([]) }];
    }

    return allPins.map((g) =>
        g === group ? { ...g, pins: update(g.pins) } : g
    );
}

/** Returns a new PinsFile with the table pinned. No-op if already pinned. */
export function addPin(
    allPins: PinsFile,
    key: PinGroupKey,
    table: PinnableTable
): PinsFile {
    if (findPinGroup(allPins, key)?.pins.some((p) => pinMatches(p, table))) {
        return allPins;
    }

    const pin: Pin = { tableId: table.id, tableName: table.name };
    if (table.uniqueId) pin.uniqueId = table.uniqueId;

    return updateGroupPins(allPins, key, (pins) => [...pins, pin]);
}

/** Returns a new PinsFile without the table's pin. */
export function removePin(
    allPins: PinsFile,
    key: PinGroupKey,
    table: PinnableTable
): PinsFile {
    return updateGroupPins(allPins, key, (pins) =>
        pins.filter((p) => !pinMatches(p, table))
    );
}

/**
 * The pinned tables in the open file, sorted by id. Unresolved pins stay in
 * pins.json but are left out (v4 greys them out instead).
 */
export function getPinnedTables<T extends PinnableTable>(
    pins: Pin[],
    tables: T[]
): T[] {
    const pinned = new Map<number, T>();

    pins.forEach((pin) => {
        const table = resolvePin(pin, tables);
        if (table) pinned.set(table.id, table);
    });

    return [...pinned.values()].sort((a, b) => a.id - b.id);
}
