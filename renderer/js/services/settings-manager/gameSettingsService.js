const preferencesService = require('../preferencesService');

let gameSettingsService = {};

gameSettingsService.initialize = function () {
    const settingsToCreate = preferencesService.getPreferenceKeys().general;
    
    Object.keys(settingsToCreate).forEach((setting) => {
        console.log(setting);
    })
};

gameSettingsService.id = 'gameSettings';

module.exports = gameSettingsService;