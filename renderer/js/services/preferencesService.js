const os = require('os');
const path = require('path');
let { app } = require('electron');
const ElectronPreferences = require('electron-preferences');

let preferencesService = {
  preferences: null
};

preferencesService.getPreferenceKeys = function () {
    if (!app) {
        app = require('electron').remote.app;
    }

    return {
        'general': {
            'defaultDirectory': path.resolve(app.getPath('documents'), 'Madden NFL 22\\saves'),
            'defaultEditor': 'open-home',
            'checkForUpdates': [
                true
            ],
            'autoSave': [
                true
            ],
            'checkForSchemaUpdates': [
                true
            ],
            'openExcelAfterImport': [
                true
            ]
        },
        'gameVersions': {
            'madden19Directory': 'C:\\Program Files (x86)\\Origin Games\\Madden NFL 19',
            'madden20Directory': 'C:\\Program Files (x86)\\Origin Games\\Madden NFL 20',
            'madden21Directory': 'C:\\Program Files (x86)\\Origin Games\\Madden NFL 21',
            'madden22Directory': 'C:\\Program Files (x86)\\Origin Games\\Madden NFL 22'
        },
        'settingsManager': {
            'general': {
                'defaultDirectorySet': false,
                'defaultEditorSet': false,
                'checkForUpdatesSet': false,
                'autoSaveSet': false,
                'checkForSchemaUpdatesSet': false,
                'openExcelAfterImportSet': false
            },
            'gameVersions': {
                'madden19DirectorySet': false,
                'madden20DirectorySet': false,
                'madden21DirectorySet': false,
                'madden22DirectorySet': false
            },
            'appVersions': {
                '4_0_0': false,
                '4_1_0': false,
                '4_1_1': false,
                '4_2_0': false,
                '4_2_1': false,
                '4_3_0': false,
                '4_3_1': false,
                '4_3_2': false,
                '4_3_3': false,
                '4_3_4': false,
            }
        }
    }
};

preferencesService.initialize = function () {
    const preferenceDefaults = preferencesService.getPreferenceKeys();
    
    preferencesService.preferences = new ElectronPreferences({
        'dataStore': path.resolve(app.getPath('userData'), 'preferences.json'),
        'defaults': preferenceDefaults,
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
                                    'label': 'Default game save directory',
                                    'key': 'defaultDirectory',
                                    'type': 'directory',
                                    'help': 'The directory to open when you choose to open a file.'
                                },
                                {
                                    'label': 'Editor to open on file load',
                                    'key': 'defaultEditor',
                                    'type': 'dropdown',
                                    'options': [
                                        { 'label': 'Home screen', 'value': 'open-home' },
                                        { 'label': 'Schedule editor', 'value': 'open-schedule' },
                                        { 'label': 'Table editor', 'value': 'open-table-editor' },
                                        { 'label': 'Schema viewer', 'value': 'open-schema-viewer' },
                                        { 'label': 'Ability editor', 'value': 'open-ability-editor' }
                                    ],
                                    'help': 'Choose the editor to open when you open a new file.'
                                },
                                {
                                    'label': 'Automatically check for application updates',
                                    'key': 'checkForUpdates',
                                    'type': 'checkbox',
                                    'options': [
                                        { 'label': 'Check for updates on app start', 'value': true }
                                    ],
                                    'help': 'If checked, the app will check to see if a new release has been made each time you start the app. You can manually check by clicking About -> Check for update at the top menu.'
                                },
                                {
                                    'label': 'Save the file after any change',
                                    'key': 'autoSave',
                                    'type': 'checkbox',
                                    'options': [
                                        { 'label': 'Auto-Save', 'value': true }
                                    ],
                                    'help': 'If checked, the app will save after any change is made.'
                                },
                                {
                                    'label': 'Automatically re-scan schemas after a Madden update',
                                    'key': 'checkForSchemaUpdates',
                                    'type': 'checkbox',
                                    'options': [
                                        { 'label': 'Check for game updates', 'value': true }
                                    ]
                                },
                                {
                                    'label': 'Open Excel after Table Export',
                                    'key': 'openExcelAfterImport',
                                    'type': 'checkbox',
                                    'options': [
                                        { 'label': 'Open Excel automatically after import is complete', 'value': true }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            },
            {
                'id': 'gameVersions',
                'label': 'Game Directories',
                'icon': 'folder-15',
                'form': {
                    'groups': [
                        {
                            'fields': [
                                {
                                    'label': 'Madden 19 game directory',
                                    'key': 'madden19Directory',
                                    'type': 'directory'
                                },
                                {
                                    'label': 'Madden 20 game directory',
                                    'key': 'madden20Directory',
                                    'type': 'directory'
                                },
                                {
                                    'label': 'Madden 21 game directory',
                                    'key': 'madden21Directory',
                                    'type': 'directory'
                                },
                                {
                                    'label': 'Madden 22 game directory',
                                    'key': 'madden22Directory',
                                    'type': 'directory'
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