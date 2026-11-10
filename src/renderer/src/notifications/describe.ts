import type { SchemaMeta } from '@shared/types';
import type { AppNotification } from '@shared/types/notifications';
import type { BannerSeverity } from '@renderer/components/Banner/Banner';
import {
    metaLabel,
    yearPrefix
} from '@renderer/routes/SchemaManagement/schemaList';
import { basename } from '@renderer/utils/path';

export type NotificationLinkId =
    'open-schemas' | 'pick-schema' | 'reload' | 'branch';

export interface NotificationLink {
    id: NotificationLinkId;
    label: string;
}

export interface NotificationText {
    title: string;
    description: string;
    links: NotificationLink[];
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
                    { id: 'reload', label: 'Reload' },
                    { id: 'branch', label: 'Branch and save new' }
                ],
                bannerMessage:
                    'This save file has been modified outside of this program. Do you want to reload the file?',
                bannerSeverity: 'info'
            };
        }
    }
}
