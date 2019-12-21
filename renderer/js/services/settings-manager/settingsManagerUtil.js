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

settingsManagerUtil.createFields = function (fields, preferences, category, newFieldParent, oldFieldParent) {
    const fieldMetadata = settingsManagerUtil.getFieldMetadata(fields, preferences, category);

    fieldMetadata.filter((field) => {
        return field.isNewField;
    }).forEach((field) => {
        createNewField(field, newFieldParent, category);
    });

    const oldFields = fieldMetadata.filter((field) => {
        return field.isNewField === false;
    });
    
    if (oldFields.length === 0) {
        oldFieldParent.classList.add('hidden');
    }
    else {
        oldFields.forEach((field) => {
            createNewField(field, oldFieldParent, category);
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