const { ipcRenderer } = require('electron');
const settingsManagerUtil = require('./settingsManagerUtil');

let gameVersionsService = {};

gameVersionsService.initialize = function () {
    const preferenceOptions = ipcRenderer.sendSync('getPreferenceOptions');
    const preferences = ipcRenderer.sendSync('getPreferences');

    const section = preferenceOptions.sections.find((section) => {
        return section.id === 'gameVersions';
    });

    const fields = section.form.groups.map((group) => {
        return group.fields;
    }).flat();

    const oldFieldWrapper = document.querySelector('.old-fields');
    const newFieldWrapper = document.querySelector('.new-fields');

    settingsManagerUtil.createFields(fields, preferences, 'gameVersions', newFieldWrapper, oldFieldWrapper);

    const continueButton = document.querySelector('.continue-btn');
    continueButton.addEventListener('click', function () {
        console.log(preferences);
        ipcRenderer.sendSync('setPreferences', preferences);
    });
};

gameVersionsService.id = 'gameDirectories';

module.exports = gameVersionsService;