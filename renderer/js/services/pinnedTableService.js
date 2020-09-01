const fs = require('fs');
const path = require('path');

const remote = require('electron').remote;
const app = remote.app;

const PATH_TO_PINS = path.join(app.getPath('userData'), 'pins.json');

let pinnedTableService = {};

pinnedTableService.initialize = (gameYear) => {
    pinnedTableService.gameYear = gameYear;

    if (!fs.existsSync(PATH_TO_PINS)) {
        pinnedTableService.allPins = getInitialPins();
        pinnedTableService.savePins();
    }
    else {
        pinnedTableService.allPins = pinnedTableService.getAllPins();
    }

    pinnedTableService.applicablePins = pinnedTableService.getPinsByGameYear(gameYear);

    if (!pinnedTableService.applicablePins) {
        const pinMeta = {
            "gameYear": gameYear,
            "pins": []
        };

        pinnedTableService.allPins.push(pinMeta);
        pinnedTableService.savePins();
        pinnedTableService.applicablePins = pinnedTableService.getPinsByGameYear(gameYear);
    }
};

pinnedTableService.addPin = (tableId, tableName) => {
    pinnedTableService.applicablePins.push({
        'tableId': tableId,
        'tableName': tableName
    });

    pinnedTableService.savePins();
};

pinnedTableService.removePin = (index) => {
    pinnedTableService.applicablePins = pinnedTableService.applicablePins.splice(index, 1);

    pinnedTableService.savePins();
};

pinnedTableService.getAllPins = () => {
    return JSON.parse(fs.readFileSync(PATH_TO_PINS));
};

pinnedTableService.savePins = () => {
    fs.writeFileSync(PATH_TO_PINS, JSON.stringify(pinnedTableService.allPins));
};

pinnedTableService.getPinsByGameYear = (gameYear) => {
    const pinMeta = pinnedTableService.allPins.find((pins) => { return pins.gameYear === gameYear; });

    if (!pinMeta) {
        return null;
    }
    else {
        return pinMeta.pins;
    }
};

module.exports = pinnedTableService;

function getInitialPins() {
    return [
        {
            "gameYear": 21,
            "pins": [
                {
                    "tableId": 4226,
                    "tableName": "Player"
                },
                {
                    "tableId": 7708,
                    "tableName": "Team"
                },
                {
                    "tableId": 4680,
                    "tableName": "Franchise"
                },
                {
                    "tableId": 4278,
                    "tableName": "League"
                }
            ]
        },
        {
            "gameYear": 20,
            "pins": [
                {
                    "tableId": 4240,
                    "tableName": "Player"
                },
                {
                    "tableId": 7890,
                    "tableName": "Team"
                },
                {
                    "tableId": 4687,
                    "tableName": "Franchise"
                },
                {
                    "tableId": 4294,
                    "tableName": "League"
                }
            ]
        }
    ]
};