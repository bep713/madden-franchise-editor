const PINS_FILENAME = "pins.json";
// madden-franchise GAME_TYPE values
const GAME_TYPE_MADDEN = "madden";
// pins.json entries written before gameType existed are Madden up to this year
const LAST_MADDEN_ONLY_YEAR = 27;

// Pins are keyed by the table's uniqueId, which stays stable across saves and
// game updates. tableId is kept as a fallback key for pins without a uniqueId
// (legacy pins, or tables whose uniqueId is 0) and as a last-known id hint.
let pinnedTableService = {};

pinnedTableService.initialize = async (
  gameYear,
  tableList = [],
  gameType = GAME_TYPE_MADDEN,
) => {
  gameType = gameType || GAME_TYPE_MADDEN;
  pinnedTableService.gameYear = gameYear;
  pinnedTableService.gameType = gameType;
  pinnedTableService.tableList = tableList;

  const allPins = await window.electronAPI.fs.readJson(PINS_FILENAME);

  pinnedTableService.allPins = allPins || getInitialPins();
  let changed = !allPins;

  if (pinnedTableService.migrateGameTypes(gameYear, gameType)) {
    changed = true;
  }

  pinnedTableService.applicablePins = pinnedTableService.getPinsByGameYear(
    gameYear,
    gameType,
  );

  if (!pinnedTableService.applicablePins) {
    const initialPinsForGameYear = getInitialPins().find((pinMeta) => {
      return pinMeta.gameYear === gameYear && pinMeta.gameType === gameType;
    });

    pinnedTableService.allPins.push(
      initialPinsForGameYear || { gameYear, gameType, pins: [] },
    );
    pinnedTableService.applicablePins = pinnedTableService.getPinsByGameYear(
      gameYear,
      gameType,
    );
    changed = true;
  }

  if (pinnedTableService.migratePins(tableList)) {
    changed = true;
  }

  if (changed) {
    await pinnedTableService.savePins();
  }
};

/**
 * Adds a gameType to pin entries written before pins were split by game type.
 * Years up to 27 were Madden only. Later years are ambiguous, so an untyped
 * entry takes the type of the first file opened for its year.
 * @returns {boolean} whether any entry changed
 */
pinnedTableService.migrateGameTypes = (gameYear, gameType) => {
  let changed = false;

  pinnedTableService.allPins.forEach((pinMeta) => {
    if (pinMeta.gameType) return;

    if (pinMeta.gameYear <= LAST_MADDEN_ONLY_YEAR) {
      pinMeta.gameType = GAME_TYPE_MADDEN;
      changed = true;
    } else if (
      pinMeta.gameYear === gameYear &&
      !pinnedTableService.getPinsByGameYear(gameYear, gameType)
    ) {
      pinMeta.gameType = gameType;
      changed = true;
    }
  });

  return changed;
};

/**
 * Fills in uniqueId on pins that lack one and refreshes the tableId hint on
 * pins that have one. Pins that can't be matched safely are left untouched.
 * @returns {boolean} whether any pin changed
 */
pinnedTableService.migratePins = (tableList = []) => {
  const byUniqueId = new Map();
  const byTableId = new Map();
  const byName = new Map();

  tableList.forEach((table) => {
    if (table.uniqueId) byUniqueId.set(table.uniqueId, table);
    byTableId.set(table.id, table);
    byName.set(table.name, (byName.get(table.name) || []).concat(table));
  });

  let changed = false;

  (pinnedTableService.applicablePins || []).forEach((pin) => {
    let table = null;

    if (pin.uniqueId) {
      table = byUniqueId.get(pin.uniqueId);
    } else {
      // Only trust the old tableId if it still points at a table of the same name
      const tableById = byTableId.get(pin.tableId);
      if (tableById?.uniqueId && tableById.name === pin.tableName) {
        table = tableById;
      } else {
        const tablesWithName = byName.get(pin.tableName) || [];
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
};

/**
 * Returns the table list entry the pin points at in the open file, or null.
 * A pin with a uniqueId never falls back to its tableId, because that id may
 * now belong to an unrelated table.
 */
pinnedTableService.resolvePin = (pin, tableList = pinnedTableService.tableList) => {
  if (!pin || !tableList) return null;

  if (pin.uniqueId) {
    return tableList.find((table) => table.uniqueId === pin.uniqueId) || null;
  }

  return tableList.find((table) => table.id === pin.tableId) || null;
};

/**
 * @param {object} pin
 * @param {{uniqueId?: number, tableId: number}} table
 */
pinnedTableService.pinMatches = (pin, table) => {
  if (!pin || !table) return false;

  if (pin.uniqueId && table.uniqueId) {
    return pin.uniqueId === table.uniqueId;
  }

  return !pin.uniqueId && pin.tableId === table.tableId;
};

pinnedTableService.addPin = ({ uniqueId, tableId, tableName }) => {
  const pin = { tableId, tableName };
  if (uniqueId) pin.uniqueId = uniqueId;

  pinnedTableService.applicablePins.push(pin);
  pinnedTableService.savePins();
};

pinnedTableService.removePinAtIndex = (index) => {
  pinnedTableService.applicablePins.splice(index, 1);
  pinnedTableService.savePins();
};

pinnedTableService.removePin = (pinToRemove) => {
  const index = pinnedTableService.applicablePins.indexOf(pinToRemove);

  if (index > -1) {
    pinnedTableService.removePinAtIndex(index);
  }
};

pinnedTableService.getAllPins = async () => {
  return await window.electronAPI.fs.readJson(PINS_FILENAME);
};

pinnedTableService.savePins = async () => {
  await window.electronAPI.fs.writeJson(
    PINS_FILENAME,
    pinnedTableService.allPins,
  );
};

/**
 * @param {{uniqueId?: number, tableId: number}} table
 */
pinnedTableService.findPin = (table) => {
  // Can be called by the first table load before the pins finish initializing
  return (pinnedTableService.applicablePins || []).find((pin) => {
    return pinnedTableService.pinMatches(pin, table);
  });
};

pinnedTableService.getPinsByGameYear = (
  gameYear,
  gameType = pinnedTableService.gameType,
) => {
  const pinMeta = pinnedTableService.allPins.find((pins) => {
    return pins.gameYear === gameYear && pins.gameType === gameType;
  });

  // undefined (not []) so initialize knows to add an entry for this game year
  return pinMeta?.pins;
};

module.exports = pinnedTableService;

function getInitialPins() {
  return [
    {
      gameYear: 22,
      gameType: GAME_TYPE_MADDEN,
      pins: [
        {
          tableId: 4220,
          tableName: "Player",
        },
        {
          tableId: 7388,
          tableName: "Team",
        },
        {
          tableId: 4688,
          tableName: "Franchise",
        },
        {
          tableId: 4269,
          tableName: "League",
        },
      ],
    },
    {
      gameYear: 21,
      gameType: GAME_TYPE_MADDEN,
      pins: [
        {
          tableId: 4226,
          tableName: "Player",
        },
        {
          tableId: 7708,
          tableName: "Team",
        },
        {
          tableId: 4680,
          tableName: "Franchise",
        },
        {
          tableId: 4278,
          tableName: "League",
        },
      ],
    },
    {
      gameYear: 20,
      gameType: GAME_TYPE_MADDEN,
      pins: [
        {
          tableId: 4240,
          tableName: "Player",
        },
        {
          tableId: 7890,
          tableName: "Team",
        },
        {
          tableId: 4687,
          tableName: "Franchise",
        },
        {
          tableId: 4294,
          tableName: "League",
        },
      ],
    },
  ];
}
