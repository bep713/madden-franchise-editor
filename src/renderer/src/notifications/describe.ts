import type { SchemaMeta } from '@shared/types';
import type { AppNotification } from '@shared/types/notifications';
import type { BannerSeverity } from '@renderer/components/Banner/Banner';
import { metaLabel } from '@renderer/routes/SchemaManagement/schemaList';

export interface NotificationText {
    title: string;
    description: string;
    linkLabel: string;
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
                linkLabel: 'Open Schema Management',
                bannerMessage:
                    "We cannot find an exact match for this file's schema. Open the schema management page?",
                bannerSeverity: 'error'
            };
        }
    }
}
