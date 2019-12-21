const settingsManagerUtil = require('./settingsManagerUtil');

let gameVersionsService = {};

gameVersionsService.initialize = function () {
    settingsManagerUtil.createFields('gameVersions');
};

gameVersionsService.id = 'gameDirectories';

module.exports = gameVersionsService;