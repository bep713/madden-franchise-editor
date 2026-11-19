import type { FileFilter } from 'electron';
import { TableData } from '@shared/types';

// Same filters as v4's ExternalDataHandler
export const SPREADSHEET_FILTERS: FileFilter[] = [
    { name: 'Excel workbook', extensions: ['xlsx'] },
    { name: 'CSV (comma-delimited)', extensions: ['csv'] },
    { name: 'Excel Macro-Enabled Workbook', extensions: ['xlsm'] },
    { name: 'Excel Binary Workbook', extensions: ['xlsb'] },
    { name: 'Excel 97-2003 Workbook', extensions: ['xls'] },
    { name: 'OpenDocument Spreadsheet', extensions: ['ods'] },
    { name: 'UTF-16 Unicode Text', extensions: ['txt'] }
];

export const RAW_TABLE_FILTERS: FileFilter[] = [
    { name: 'DAT file', extensions: ['dat'] }
];

export const FRT_FILTERS: FileFilter[] = [
    { name: 'FRT file', extensions: ['frt'] }
];

// Same rows as v4's externalDataService.exportTableData
export function getExportData(table: TableData): {
    headers: string[];
    rows: unknown[][];
} {
    const headers = table.headers.map((header) => header.name);
    const rows = table.records.map((record) =>
        headers.map((name) => record[name] ?? '')
    );
    return { headers, rows };
}

export function errorMessage(error: unknown): string {
    return (error as Error)?.message || String(error);
}
