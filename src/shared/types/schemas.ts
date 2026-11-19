import type { SchemaMeta } from './franchise';

// franchise:get-saved-schemas entries (FranchiseFileManager.getSavedSchemas)

// bundled: shipped with madden-franchise; custom: in <userData>/schemas
export type SchemaSource = 'bundled' | 'custom';

export interface SchemaEntry {
    // Both null when the filename has no M/C prefix (e.g. 220_0.gz)
    gameType: 'madden' | 'college' | null;
    gameYear: number | null;
    major: number;
    minor: number;
    path: string;
    source: SchemaSource;
}

// electronAPI.schema.getFields entries and result
export interface SchemaField {
    name: string;
    table: string;
    // '' when the schema has none
    type: string;
}

export type SchemaFieldsSource = { path: string } | { fileId: string };

export interface SchemaFieldsResult {
    meta: SchemaMeta | null;
    fields: SchemaField[];
}
