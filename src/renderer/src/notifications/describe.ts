import type { SchemaMeta } from '@shared/types';
import type { AppNotification } from '@shared/types/notifications';
import type { BannerSeverity } from '@renderer/components/Banner/Banner';
import {
    metaLabel,
    yearPrefix
} from '@renderer/routes/SchemaManagement/schemaList';
import { basename } from '@renderer/utils/path';

export type NotificationLinkId =
    | 'open-schemas'
    | 'pick-schema'
    | 'load'
    | 'keep'
    | 'copy'
    | 'put-back'
    | 'install-update';

export interface NotificationLink {
    id: NotificationLinkId;
    label: string;
}

export interface NotificationText {
    title: string;
    description: string;
    links: NotificationLink[];
    // Unused for file-changed and file-missing: the bar under the tabs shows them
    bannerMessage: string;
    bannerSeverity: BannerSeverity;
}

function label(
    meta: SchemaMeta | null,
    gameType: string,
    fallback: string
): string {
    return meta ? metaLabel(meta, gameType) : fallback;
}

// The drawer's and banner's text for a notification. The link's action lives
// in the drawer, since it needs hooks.
export function describeNotification(n: AppNotification): NotificationText {
    switch (n.kind) {
        case 'schema-mismatch': {
            const { expected, loaded, gameType } = n.data;
            return {
                title: 'Schema Mismatch',
                description: `Loaded ${label(loaded, gameType, 'none')}, expected ${label(expected, gameType, 'unknown')}.`,
                links: [
                    { id: 'open-schemas', label: 'Open Schema Management' }
                ],
                bannerMessage:
                    "We cannot find an exact match for this file's schema. Open the schema management page?",
                bannerSeverity: 'error'
            };
        }
        case 'schema-missing': {
            const { path, game } = n.data;
            const name = basename(path);
            return {
                title: 'Schema Missing',
                description: `${name} could not be opened because no schema exists for ${game ? yearPrefix(game.gameType, game.gameYear) : 'this game'}.`,
                links: [{ id: 'pick-schema', label: 'Choose a schema' }],
                bannerMessage: `No schema was found for ${name}. Choose one on the Schema Management page?`,
                bannerSeverity: 'error'
            };
        }
        case 'file-changed': {
            const name = basename(n.data.path);
            return {
                title: 'File Changed',
                description: `${name} was changed outside the editor.`,
                links: [
                    { id: 'copy', label: 'Save mine as a copy…' },
                    { id: 'load', label: 'Load the new version' },
                    { id: 'keep', label: 'Keep my version' }
                ],
                bannerMessage:
                    'This save file has been modified outside of this program. Do you want to reload the file?',
                bannerSeverity: 'info'
            };
        }
        case 'file-missing': {
            const name = basename(n.data.path);
            return {
                title: 'File Missing',
                description: `${name} was deleted or moved outside the editor.`,
                links: [
                    { id: 'copy', label: 'Save mine as a copy…' },
                    { id: 'put-back', label: 'Put it back' }
                ],
                bannerMessage:
                    'This save file was deleted or moved outside of this program. Save it again here, or save it to a new location?',
                bannerSeverity: 'error'
            };
        }
        case 'update-available': {
            const { version, currentVersion, channel } = n.data;
            const available = `${channel === 'nightly' ? 'Nightly build' : 'Version'} ${version} is available (you have ${currentVersion}).`;
            return {
                title: 'Update Available',
                description: available,
                links: [{ id: 'install-update', label: 'Install update' }],
                // useUpdateBanners shows the banner, from update-ready
                bannerMessage: `${available} It will take less than 5 minutes to install.`,
                bannerSeverity: 'info'
            };
        }
    }
}
