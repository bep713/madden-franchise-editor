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
