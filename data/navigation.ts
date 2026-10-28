import { FileMetadata, FileType, Navigation, NavigationItem } from '@shared/types';

// Mirrors data/navigation.json (v4). `implemented` marks the pages React has.
const ALL_VERSIONS = [19, 20, 21, 22, 23, 24, 25, 26, 27];

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
            implemented: true,
            availableVersions: ALL_VERSIONS,
            availableFormats: [FileType.FRANCHISE, FileType.COMMON],
            menu: {
                disable: [
                    'Save',
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable',
                    'CopyUniqueId'
                ]
            }
        },
        {
            id: 'schedule-editor',
            href: '/schedule-editor',
            text: 'Schedule',
            longText: 'View/edit the schedule',
            classList: [],
            image: 'schedule.png',
            service: 'scheduleEditorService',
            clickListener: 'onScheduleEditorClicked',
            availableVersions: ALL_VERSIONS,
            availableFormats: [FileType.FRANCHISE],
            availableTypes: ['madden'],
            menu: {
                enable: ['Save'],
                disable: [
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable',
                    'CopyUniqueId'
                ]
            }
        },
        {
            id: 'schema-management',
            href: '/schema-management',
            text: 'Schemas',
            longText: 'Open the schema viewer',
            classList: [],
            image: 'schema.png',
            service: 'schemaViewerService',
            clickListener: 'onSchemaViewerClicked',
            availableVersions: ALL_VERSIONS,
            availableFormats: [FileType.FRANCHISE, FileType.COMMON],
            menu: {
                disable: [
                    'Save',
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable',
                    'CopyUniqueId'
                ]
            }
        },
        {
            id: 'table-editor',
            href: '/table-editor',
            text: 'Open Table...',
            longText: 'Open the table editor',
            classList: [],
            image: 'table.png',
            service: 'tableEditorService',
            clickListener: 'onTableEditorClicked',
            implemented: true,
            availableFormats: [FileType.FRANCHISE, FileType.COMMON],
            availableVersions: ALL_VERSIONS,
            menu: {
                enable: [
                    'Save',
                    'Export',
                    'Import',
                    'LogTable',
                    'ExportRawTable',
                    'ExportFRT',
                    'ImportRawTable',
                    'CopyUniqueId'
                ]
            }
        }
    ]
};

// The main tabs for an open file (v4's generateMainNavigationTabs). Without a
// file, only the alwaysShow items (Home).
export function getNavigationItems(metadata?: FileMetadata): NavigationItem[] {
    return navigation.items.filter(
        (item) =>
            item.alwaysShow ||
            (metadata &&
                item.availableVersions.includes(metadata.gameYear) &&
                item.availableFormats.includes(metadata.format) &&
                (!item.availableTypes ||
                    item.availableTypes.includes(metadata.type?.gameType)))
    );
}

export default navigation;
