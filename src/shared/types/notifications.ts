// Notifications main keeps in main/services/notificationStore.js and sends
// over notifications:* channels (electronAPI.notifications).
import type { SchemaMeta } from './franchise';

export interface SchemaMismatchData {
    expected: SchemaMeta | null;
    loaded: SchemaMeta | null;
    gameType: string;
}

// The open options a retry needs: a common file's year and type
export interface SchemaMissingOpenOptions {
    gameYearOverride?: number;
    gameTypeOverride?: string;
}

export interface SchemaMissingData {
    path: string;
    openOptions?: SchemaMissingOpenOptions;
    // Read from the file; absent when it couldn't be
    game?: { gameYear: number; gameType: string };
}

interface NotificationBase {
    id: string;
    createdAt: number; // ms epoch
    read: boolean;
    fileId?: string;
}

export type AppNotification =
    | (NotificationBase & { kind: 'schema-mismatch'; data: SchemaMismatchData })
    | (NotificationBase & { kind: 'schema-missing'; data: SchemaMissingData });

export type NotificationKind = AppNotification['kind'];
