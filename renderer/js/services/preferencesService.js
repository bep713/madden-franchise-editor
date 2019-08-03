const os = require('os');
const path = require('path');
const { app } = require('electron');
const ElectronPreferences = require('electron-preferences');

let preferencesService = {
  preferences: null
};

preferencesService.initialize = function () {
  preferencesService.preferences = new ElectronPreferences({
    'dataStore': path.resolve(app.getPath('userData'), 'preferences.json'),
    'defaults': {
        'general': {
            'defaultDirectory': path.resolve(app.getPath('documents'), 'Madden NFL 20\\settings'),
            'autoSave': [
                true
            ]
        }
    },
    'sections': [
        {
            'id': 'general',
            'label': 'General',
            'icon': 'settings-gear-63',
            'form': {
                'groups': [
                    {
                        'label': 'General settings',
                        'fields': [
                            {
                                'label': 'Default directory',
                                'key': 'defaultDirectory',
                                'type': 'directory',
                                'help': 'The directory to open when you choose to open a file.'
                            },
                            {
                                'label': 'Auto-Save',
                                'key': 'autoSave',
                                'type': 'checkbox',
                                'options': [
                                    { 'label': 'Auto-Save', 'value': true }
                                ],
                                'help': 'If checked, the app will save after any change is made'
                            }
                        ]
                    }
                ]
            }
        }
    ]
  });
};

module.exports = preferencesService;