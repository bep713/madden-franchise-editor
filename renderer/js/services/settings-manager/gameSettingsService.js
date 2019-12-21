const { ipcRenderer } = require('electron');
const settingsManagerUtil = require('./settingsManagerUtil');

let gameSettingsService = {};

gameSettingsService.initialize = function () {
    settingsManagerUtil.createFields('general');
};

gameSettingsService.id = 'gameSettings';

module.exports = gameSettingsService;