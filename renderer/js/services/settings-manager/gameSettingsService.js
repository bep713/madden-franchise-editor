const { ipcRenderer } = require('electron');
const settingsManagerUtil = require('./settingsManagerUtil');

let gameSettingsService = {};

gameSettingsService.initialize = function () {
    const preferenceOptions = ipcRenderer.sendSync('getPreferenceOptions');
    const preferences = ipcRenderer.sendSync('getPreferences');

    const section = preferenceOptions.sections.find((section) => {
        return section.id === 'general';
    });

    const fields = section.form.groups.map((group) => {
        return group.fields;
    }).flat();

    const oldFieldWrapper = document.querySelector('.old-fields');
    const newFieldWrapper = document.querySelector('.new-fields');

    settingsManagerUtil.createFields(fields, preferences, 'general', newFieldWrapper, oldFieldWrapper);

    const continueButton = document.querySelector('.continue-btn');
    continueButton.addEventListener('click', function () {
        ipcRenderer.sendSync('setPreferences', preferences);
    });
};

gameSettingsService.id = 'gameSettings';

module.exports = gameSettingsService;