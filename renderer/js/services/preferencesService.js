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
            'defaultEditor': 'open-home',
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
                                'help': 'If checked, the app will save after any change is made.'
                            },
                            {
                                'label': 'Auto-Open',
                                'key': 'defaultEditor',
                                'type': 'dropdown',
                                'options': [
                                    { 'label': 'Home screen', 'value': 'open-home' },
                                    { 'label': 'Schedule editor', 'value': 'open-schedule' },
                                    { 'label': 'Table editor', 'value': 'open-table-editor' },
                                    { 'label': 'Schema viewer', 'value': 'open-schema-viewer' }
                                ],
                                'help': 'Choose the editor to open when you open a new file.'
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