const PINS_FILENAME = "pins.json";

let pinnedTableService = {};

pinnedTableService.initialize = async (gameYear) => {
  pinnedTableService.gameYear = gameYear;

  const allPins = await window.electronAPI.fs.readJson(PINS_FILENAME);

  if (!allPins) {
    pinnedTableService.allPins = getInitialPins();
    await pinnedTableService.savePins();
  } else {
    pinnedTableService.allPins = allPins;
  }

  pinnedTableService.applicablePins =
    pinnedTableService.getPinsByGameYear(gameYear);

  if (!pinnedTableService.applicablePins) {
    const initialPins = getInitialPins();
    const initialPinsForGameYear = initialPins.find((pin) => {
      return pin.gameYear === gameYear;
    });

    if (initialPinsForGameYear) {
      pinnedTableService.allPins.push(initialPinsForGameYear);
    } else {
      pinnedTableService.allPins.push({
        gameYear: gameYear,
        pins: [],
      });
    }

    await pinnedTableService.savePins();
    pinnedTableService.applicablePins =
      pinnedTableService.getPinsByGameYear(gameYear);
  }
};

pinnedTableService.addPin = (tableId, tableName) => {
  pinnedTableService.applicablePins.push({
    tableId: tableId,
    tableName: tableName,
  });

  pinnedTableService.savePins();
};

pinnedTableService.removePinAtIndex = (index) => {
  pinnedTableService.applicablePins.splice(index, 1);
  pinnedTableService.savePins();
};

pinnedTableService.removePin = (tableId) => {
  const index = pinnedTableService.applicablePins.findIndex((pin) => {
    return pin.tableId === tableId;
  });

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

pinnedTableService.findPin = (tableId) => {
  return pinnedTableService.applicablePins.find((pin) => {
    return pin.tableId === tableId;
  });
};

pinnedTableService.getPinsByGameYear = (gameYear) => {
  const pinMeta = pinnedTableService.allPins.find((pins) => {
    return pins.gameYear === gameYear;
  });

  if (!pinMeta) {
    return [];
  } else {
    return pinMeta.pins;
  }
};

module.exports = pinnedTableService;

function getInitialPins() {
  return [
    {
      gameYear: 22,
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
