const elementCreationUtil = require('./elementCreationUtil');

let settingsManagerUtil = {};

settingsManagerUtil.getNewPreferences = function (preferences, category) {
    return Object.entries(preferences.settingsManager[category])
        .filter((setting) => { 
            return setting[1] === false;
        })
        .map((entry) => {
            return entry[0];
        });
};

settingsManagerUtil.getFieldMetadata = function (fields, preferences, category) {
    const newPreferences = settingsManagerUtil.getNewPreferences(preferences, category);
    console.log(newPreferences);

    return fields.map((field) => {
        const isNewField = newPreferences.findIndex((pref) => { 
            return pref === field.key + 'Set';
        }) > -1;

        field.isNewField = isNewField;
        return field;
    });  
};

settingsManagerUtil.addListeners = function (preferences) {
    const savePreferences = function () {
        ipcRenderer.sendSync('setPreferences', preferences);
    };
    
    const continueButton = document.querySelector('.continue-btn');
    continueButton.addEventListener('click', savePreferences);

    const previousButton = document.querySelector('.back-btn');
    previousButton.addEventListener('click', savePreferences);
};

settingsManagerUtil.createFields = function (category) {
    const preferenceOptions = ipcRenderer.sendSync('getPreferenceOptions');
    const preferences = ipcRenderer.sendSync('getPreferences');

    settingsManagerUtil.addListeners(preferences);

    const section = preferenceOptions.sections.find((section) => {
        return section.id === category;
    });

    const fields = section.form.groups.map((group) => {
        return group.fields;
    }).flat();

    const oldFieldWrapper = document.querySelector('.old-fields');
    const newFieldWrapper = document.querySelector('.new-fields');

    const fieldMetadata = settingsManagerUtil.getFieldMetadata(fields, preferences, category);

    const newFields = fieldMetadata.filter((field) => {
        return field.isNewField;
    });

    if (newFields.length === 0) {
        newFieldWrapper.classList.add('hidden');
    }
    else {
        newFields.forEach((field) => {
            createNewField(field, newFieldWrapper, category);
        });
    }

    const oldFields = fieldMetadata.filter((field) => {
        return field.isNewField === false;
    });
    
    if (oldFields.length === 0) {
        oldFieldWrapper.classList.add('hidden');
    }
    else {
        oldFields.forEach((field) => {
            createNewField(field, oldFieldWrapper, category);
        });
    }

    function createNewField (field, parentElement, category) {
        const currentValue = getPreferenceKeyValue(field.key, category);
        const element = elementCreationUtil.createField(field, currentValue);
        parentElement.appendChild(element);
        element.addEventListener('setting-change', function (e) {
            setPreferenceKeyValue(field, e.detail, category);
        });
    };

    function getPreferenceKeyValue(key, category) {
        if (preferences[category][key] !== null && preferences[category][key] !== undefined) {
            return preferences[category][key];
        }
        else {
            console.log('here');
        }
    };
    
    function setPreferenceKeyValue(field, value, category) {
        if (preferences[category][field.key] !== null && preferences[category][field.key] !== undefined) {
            switch(field.type) {
                case 'checkbox':
                    if (value) {
                        preferences[category][field.key] = [value];
                    } 
                    else {
                        preferences[category][field.key] = [];
                    }
    
                    break;
                case 'text':
                default:
                    preferences[category][field.key] = value;
                    break;
            }
        }
        else {
            console.log('here');
        }
    };
};

module.exports = settingsManagerUtil;