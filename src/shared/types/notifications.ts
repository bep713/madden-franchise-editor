// Notifications main keeps in main/services/notificationStore.js and sends
// over notifications:* channels (electronAPI.notifications).
import type { SchemaMeta } from './franchise';

export type NotificationKind = 'schema-mismatch'; // 04o6 adds 'schema-missing'

export interface SchemaMismatchData {
    expected: SchemaMeta | null;
    loaded: SchemaMeta | null;
    gameType: string;
}

export interface AppNotification {
    id: string;
    kind: NotificationKind;
    createdAt: number; // ms epoch
    read: boolean;
    fileId?: string;
    data: SchemaMismatchData;
}
