const { ipcRenderer, remote } = require('electron');
const elementCreationUtil = require('./elementCreationUtil');

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

    const fieldWrapper = document.querySelector('.fields-wrapper');
    
    fields.forEach((field) => {
        const currentValue = getPreferenceKeyValue(field.key);
        const element = elementCreationUtil.createField(field, currentValue);
        fieldWrapper.appendChild(element);

        element.addEventListener('setting-change', function (e) {
            setPreferenceKeyValue(field, e.detail);
        });
    });

    const continueButton = document.querySelector('.continue-btn');
    continueButton.addEventListener('click', function () {
        ipcRenderer.sendSync('setPreferences', preferences);
    });

    function getPreferenceKeyValue(key) {
        if (preferences.general[key]) {
            return preferences.general[key];
        }
        else {
            console.log('here');
        }
    };

    function setPreferenceKeyValue(field, value) {
        if (preferences.general[field.key] !== null && preferences.general[field.key] !== undefined) {
            switch(field.type) {
                case 'checkbox':
                    if (value) {
                        preferences.general[field.key] = [value];
                    } 
                    else {
                        preferences.general[field.key] = [];
                    }

                    break;
                case 'text':
                default:
                    preferences.general[field.key] = value;
                    break;
            }
        }
        else {
            console.log('here');
        }
    };
};

gameSettingsService.id = 'gameSettings';

module.exports = gameSettingsService;