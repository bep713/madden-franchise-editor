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
    recordMeta: RecordMeta[];
    emptyRecordIndices: number[];
    cellErrors: Record<number, Record<string, string>>;
    headers: TableColumn[];
    usingGenericSchema: boolean;
}

export type ReadTableDataResult = TableData | ErrorResult;

// writeBulkTableCells input entry
export interface CellWrite {
    tableId: number;
    recordIndex: number;
    fieldName: string;
    value: unknown;
}

export interface RecordMeta {
    index: number;
    isEmpty: boolean;
}

// writeBulkTableCells records[]: one per written row
export interface WrittenRecord {
    tableId: number;
    recordIndex: number;
    record: Record<string, unknown>;
    recordMeta: RecordMeta;
    previousRecordMeta: RecordMeta;
    cellErrors: Record<string, string> | null;
}

// writeBulkTableCells emptyStates[]: only for tables that had a row un-emptied
export interface EmptyState {
    tableId: number;
    emptyRecordIndices: number[];
    emptyRecords: { index: number; record: Record<string, unknown> }[];
}

// franchise:write-bulk-table-cells
export type WriteBulkTableCellsResult =
    | {
          success: true;
          // index is the position in the CellWrite[] that was sent
          results: { success: boolean; index: number; error?: string }[];
          records: WrittenRecord[];
          emptyStates: EmptyState[];
      }
    | { success: false; error: string };

// franchise:save-file / franchise:save-file-as
export type SaveFileResult = { path: string } | ErrorResult;

// franchise:get-references-to-record data[]: one per referencing record
export interface RecordReference {
    tableId: number;
    name: string;
    recordIndex: number;
    fieldName?: string;
    // The field's column in the table's headers
    fieldIndex?: number;
}

export type GetReferencesResult = { data: RecordReference[] } | ErrorResult;

// The empty-record state of the table a call changed
export type EmptyRecordsState = Omit<EmptyState, 'tableId'>;

// franchise:set-table-records-empty
export type SetRecordsEmptyResult =
    | ({ success: true; affectedCount: number } & EmptyRecordsState)
    | ErrorResult;

// franchise:set-table-next-record-to-use
export type SetNextRecordResult =
    | ({ success: true; nextRecordToUse: number } & EmptyRecordsState)
    | ErrorResult;
