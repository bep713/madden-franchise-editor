// Response shapes of the v4 franchise IPC channels
// (main/services/FranchiseFileManager.js), as the React renderer sees them.

// Matches v4's metadata.format and data/navigation.json availableFormats.
export enum FileType {
    FRANCHISE = 'franchise',
    COMMON = 'franchise-common'
}

export enum FranchiseCapability {
    SCHEDULE_EDITOR,
    TABLE_EDITOR,
    SCHEMA_VIEWER,
    ABILITY_EDITOR
}

export enum TableType {
    ASTO = 'ASTO',
    SPBF = 'SPBF',
    SPEX = 'SPEX'
}

export interface ErrorResult {
    error: string;
}

// madden-franchise's FileType (FranchiseFile.type)
export interface FranchiseFileType {
    format: FileType;
    year: number;
    compressed: boolean;
    gameType: string;
}

export interface SchemaMeta {
    gameYear: string | number | null;
    major: number | null;
    minor: number | null;
}

// _buildMetadataUntimed
export interface FileMetadata {
    gameYear: number;
    type: FranchiseFileType;
    format: FileType;
    isLoaded: boolean;
    expectedSchemaVersion: SchemaMeta | null;
    schemaList: { meta: SchemaMeta; path: string } | null;
    tableCount: number;
    tables: {
        id: number;
        name: string;
        recordCount: number;
        isArray: boolean;
    }[];
}

// franchise:open-file
export type OpenFileResult =
    { fileId: string; metadata: FileMetadata } | ErrorResult;

// getTableList
export interface TableListItem {
    id: number;
    uniqueId: number;
    name: string;
    recordCount: number;
    isArray: boolean;
    type?: TableType; // TODO(frtk): never set; SPEX tables are not produced yet
}

export interface TableEnum {
    name: string;
    members: { name: string; value: number | string }[];
}

// readTableData headers[]
export interface TableColumn {
    name: string;
    type: string;
    offset: number;
    isReference: boolean;
    valueInThirdTable: boolean;
    maxLength: number | null;
    length: number;
    enum: TableEnum | null;
}

// readTableData
export interface TableData {
    tableId: number;
    uniqueId: number;
    header: Record<string, unknown>;
    name: string;
    recordCount: number;
    records: Record<string, unknown>[];
    recordMeta: { index: number; isEmpty: boolean }[];
    emptyRecordIndices: number[];
    cellErrors: Record<number, Record<string, string>>;
    headers: TableColumn[];
    usingGenericSchema: boolean;
}

export type ReadTableDataResult = TableData | ErrorResult;
