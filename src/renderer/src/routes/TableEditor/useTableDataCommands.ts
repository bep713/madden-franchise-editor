import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { FileFilter } from 'electron';
import { TableData } from '@shared/types';
import { LoaderOptionsSetter } from '@renderer/hooks/useLoader';
import {
    FRT_FILTERS,
    RAW_TABLE_FILTERS,
    SPREADSHEET_FILTERS,
    errorMessage,
    getExportData
} from './externalData';

export interface TableDataCommandContext {
    fileId: string;
    // The loaded table
    table: TableData;
    isExpressionTable: boolean;
    // Reloads the table after an import
    reloadTable: () => Promise<void>;
    setLoaderOptions: LoaderOptionsSetter;
}

export type TableDataCommand =
    | 'export'
    | 'import'
    | 'exportRawTable'
    | 'exportFrt'
    | 'importRawTable'
    | 'logTable'
    | 'copyUniqueId';

// App menu channel (main.js) -> command, as in v4's TableEditorWrapper
const MENU_CHANNELS: Record<string, TableDataCommand> = {
    'export-file': 'export',
    'import-file': 'import',
    'export-raw-table': 'exportRawTable',
    'export-frt': 'exportFrt',
    'import-raw-table': 'importRawTable',
    'log-table': 'logTable',
    'copy-unique-id': 'copyUniqueId'
};

type Direction = 'export' | 'import';

interface Transfer {
    direction: Direction;
    // Called with the path picked in the dialog
    run: (filePath: string) => Promise<void>;
    errorMessage: (error: unknown) => string;
    errorDetail?: (error: unknown) => string;
}

async function pickSavePath(
    title: string,
    filters: FileFilter[],
    defaultPath?: string
): Promise<string | undefined> {
    const result = await window.electronAPI.showSaveDialog({
        title,
        filters,
        defaultPath
    });
    return result.canceled ? undefined : result.filePath || undefined;
}

async function pickOpenPath(
    title: string,
    filters: FileFilter[]
): Promise<string | undefined> {
    const result = await window.electronAPI.showOpenDialog({ title, filters });
    return result.canceled ? undefined : result.filePaths?.[0];
}

// Loader, window title events and error box around an IPC call, as in v4's
// ExternalDataHandler
async function transfer(
    filePath: string,
    setLoaderOptions: LoaderOptionsSetter,
    { direction, run, errorMessage, errorDetail }: Transfer
): Promise<void> {
    setLoaderOptions({
        message: direction === 'export' ? 'Exporting...' : 'Importing...',
        show: true
    });
    // Let the loader paint before the (possibly long) IPC call
    await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
    );
    try {
        // Main sets the window title
        window.electronAPI.send(
            direction === 'export' ? 'exporting' : 'importing'
        );
        await run(filePath);
        window.electronAPI.send(
            direction === 'export' ? 'exported' : 'imported'
        );
    } catch (error) {
        console.error(error);
        window.electronAPI.send(`${direction}-error`);
        await window.electronAPI.showMessageBox({
            type: 'error',
            title:
                direction === 'export'
                    ? 'Unable to export'
                    : 'Unable to import',
            message: errorMessage(error),
            detail: errorDetail?.(error)
        });
    } finally {
        setLoaderOptions({ show: false });
    }
}

async function runCommand(
    command: TableDataCommand,
    context: TableDataCommandContext
): Promise<void> {
    const { fileId, table, isExpressionTable, reloadTable, setLoaderOptions } =
        context;

    switch (command) {
        case 'export': {
            // TODO(frtk): expression tables can't be exported yet
            if (isExpressionTable) {
                return;
            }
            const filePath = await pickSavePath(
                'Select destination file for table export',
                SPREADSHEET_FILTERS,
                table.name
            );
            if (!filePath) {
                return;
            }
            let exported = false;
            await transfer(filePath, setLoaderOptions, {
                direction: 'export',
                run: async (path) => {
                    const { headers, rows } = getExportData(table);
                    await window.electronAPI.externalData.export(
                        path,
                        headers,
                        rows
                    );
                    exported = true;
                },
                errorMessage: () =>
                    'Unable to export the file because it is currently open in another program. Try closing the file in Excel before exporting.',
                errorDetail: errorMessage
            });
            if (exported) {
                const openAfter = await window.electronAPI.preferences.getValue(
                    'general.openExcelAfterImport'
                );
                if ((openAfter as unknown[] | undefined)?.[0]) {
                    window.electronAPI.send('open-path', filePath);
                }
            }
            return;
        }
        case 'import': {
            if (isExpressionTable) {
                return;
            }
            const filePath = await pickOpenPath(
                'Select file for table import',
                SPREADSHEET_FILTERS
            );
            if (!filePath) {
                return;
            }
            await transfer(filePath, setLoaderOptions, {
                direction: 'import',
                run: async (path) => {
                    const rows =
                        await window.electronAPI.externalData.import(path);
                    await window.electronAPI.externalData.importBulk(
                        fileId,
                        table.tableId,
                        rows
                    );
                    await reloadTable();
                },
                errorMessage: (error) =>
                    `Unable to import the table. Error: ${errorMessage(error)}`
            });
            return;
        }
        case 'exportRawTable': {
            const filePath = await pickSavePath(
                'Select destination file for raw table export',
                RAW_TABLE_FILTERS,
                table.name
            );
            if (!filePath) {
                return;
            }
            await transfer(filePath, setLoaderOptions, {
                direction: 'export',
                run: (path) =>
                    window.electronAPI.externalData.rawExport(
                        fileId,
                        table.tableId,
                        path
                    ),
                errorMessage: (error) =>
                    `Unable to export. Error: ${errorMessage(error)}`
            });
            return;
        }
        case 'exportFrt': {
            const filePath = await pickSavePath(
                'Select destination file for raw FRT file export',
                FRT_FILTERS
            );
            if (!filePath) {
                return;
            }
            await transfer(filePath, setLoaderOptions, {
                direction: 'export',
                run: (path) =>
                    window.electronAPI.externalData.frtExport(fileId, path),
                errorMessage: (error) =>
                    `Error while exporting FRTK file: ${errorMessage(error)}`
            });
            return;
        }
        case 'importRawTable': {
            // v4 also allows any extension here
            const filePath = await pickOpenPath('Select the file to import', [
                { name: 'DAT file', extensions: ['dat', '*'] }
            ]);
            if (!filePath) {
                return;
            }
            await transfer(filePath, setLoaderOptions, {
                direction: 'import',
                run: async (path) => {
                    await window.electronAPI.externalData.rawImport(
                        fileId,
                        table.tableId,
                        path
                    );
                    await reloadTable();
                },
                errorMessage: (error) =>
                    `Unable to import the raw table. Error: ${errorMessage(error)}`
            });
            return;
        }
        case 'logTable':
            console.log(table);
            return;
        case 'copyUniqueId':
            if (table.uniqueId === undefined || table.uniqueId === null) {
                console.warn('No Unique ID found for the selected table.');
                return;
            }
            try {
                await navigator.clipboard.writeText(String(table.uniqueId));
                console.log(`Copied Unique ID: ${table.uniqueId}`);
            } catch (error) {
                console.error('Failed to copy Unique ID: ', error);
            }
            return;
    }
}

// The table editor's export/import commands, from the action bar and the
// app menu (File > Export/Import, Tools > raw table, FRT, log, copy ID).
// getContext is read when a command runs, so the returned function is stable
// and the menu listeners are only added once. It returns null when no table
// is loaded.
export default function useTableDataCommands(
    getContext: () => TableDataCommandContext | null
): (command: TableDataCommand) => Promise<void> {
    const latest = useRef(getContext);
    useLayoutEffect(() => {
        latest.current = getContext;
    });
    // One command at a time (e.g. Ctrl+E pressed twice)
    const busy = useRef(false);

    const run = useCallback(async (command: TableDataCommand) => {
        if (busy.current) {
            return;
        }
        const context = latest.current();
        if (!context) {
            return;
        }
        busy.current = true;
        try {
            await runCommand(command, context);
        } finally {
            busy.current = false;
        }
    }, []);

    useEffect(() => {
        for (const [channel, command] of Object.entries(MENU_CHANNELS)) {
            window.electronAPI.on(channel, () => void run(command));
        }
        return () => {
            // The preload has no per-callback removal; only React listens
            // on these channels in this window.
            for (const channel of Object.keys(MENU_CHANNELS)) {
                window.electronAPI.removeAllListeners(channel);
            }
        };
    }, [run]);

    return run;
}
