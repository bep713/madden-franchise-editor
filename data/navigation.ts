import { FileType, Navigation } from '@shared/types';

const navigation: Navigation = {
    items: [
        {
            id: 'home',
            href: '/',
            text: 'Home',
            longText: 'Home',
            classList: [],
            image: 'home.png',
            clickListener: 'onHomeClicked',
            service: 'welcomeService',
            alwaysShow: true,
            availableVersions: [19, 20, 21, 22, 23, 24, 25, 26],
            availableFormats: [
                FileType.FRANCHISE,
                FileType.OTHER_COMPRESSED,
                FileType.OTHER_UNCOMPRESSED
            ],
            menu: {
                disable: [
                    'Save',
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable'
                ]
            }
        },
        // {
        //     id: 'schedule-editor',
        //     href: '/schedule-editor',
        //     text: 'Schedule',
        //     longText: 'View/edit the schedule',
        //     classList: [],
        //     image: 'schedule.png',
        //     service: 'scheduleEditorService',
        //     clickListener: 'onScheduleEditorClicked',
        //     availableVersions: [19, 20, 21, 22, 23, 24, 25, 26],
        //     availableFormats: ['franchise'],
        //     menu: {
        //         enable: ['Save'],
        //         disable: [
        //             'Export',
        //             'Import',
        //             'LogTable',
        //             'ExportRawTable',
        //             'ExportFRT',
        //             'ImportRawTable'
        //         ]
        //     }
        // },
        {
            id: 'ability-editor',
            href: '/ability-editor',
            text: 'Abilities',
            longText: 'Open the ability editor',
            classList: [],
            image: '',
            service: 'abilityEditorService',
            clickListener: 'onAbilityEditorClicked',
            availableVersions: [20],
            availableFormats: [FileType.FRANCHISE],
            menu: {
                enable: ['Save'],
                disable: [
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable'
                ]
            }
        },
        // {
        //     id: 'schema-management',
        //     href: '/schema-management',
        //     text: 'Schemas',
        //     longText: 'Open the schema viewer',
        //     classList: [],
        //     image: 'schema.png',
        //     service: 'schemaViewerService',
        //     clickListener: 'onSchemaViewerClicked',
        //     availableVersions: [19, 20, 21, 22, 23, 24, 25, 26],
        //     availableFormats: ['franchise', 'franchise-common'],
        //     menu: {
        //         disable: [
        //             'Save',
        //             'Export',
        //             'Import',
        //             'LogTable',
        //             'ExportRawTable',
        //             'ExportFRT',
        //             'ImportRawTable'
        //         ]
        //     }
        // },
        {
            id: 'table-editor',
            href: '/table-editor',
            text: 'Open Table...',
            longText: 'Open the table editor',
            classList: [],
            image: 'table.png',
            service: 'tableEditorService',
            clickListener: 'onTableEditorClicked',
            availableFormats: [
                FileType.FRANCHISE,
                FileType.OTHER_COMPRESSED,
                FileType.OTHER_UNCOMPRESSED
            ],
            availableVersions: [19, 20, 21, 22, 23, 24, 25, 26],
            menu: {
                enable: [
                    'Save',
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable'
                ]
            }
        }
    ]
};

export default navigation;
