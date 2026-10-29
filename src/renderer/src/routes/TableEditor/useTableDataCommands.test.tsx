import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TableData } from '@shared/types';
import useTableDataCommands, {
    TableDataCommand,
    TableDataCommandContext
} from './useTableDataCommands';

const listeners: Record<string, () => void> = {};

const electronAPI = {
    on: vi.fn((channel: string, callback: () => void) => {
        listeners[channel] = callback;
    }),
    send: vi.fn(),
    removeAllListeners: vi.fn(),
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
    preferences: { getValue: vi.fn() },
    externalData: {
        export: vi.fn(),
        import: vi.fn(),
        importBulk: vi.fn(),
        rawExport: vi.fn(),
        frtExport: vi.fn(),
        rawImport: vi.fn()
    }
};

const table = {
    tableId: 7,
    uniqueId: 1234,
    name: 'Player',
    headers: [{ name: 'A' }, { name: 'B' }],
    records: [{ A: 1, B: null }]
} as unknown as TableData;

const setLoaderOptions = vi.fn();
const reloadTable = vi.fn();

function makeContext(
    overrides: Partial<TableDataCommandContext> = {}
): TableDataCommandContext {
    return {
        fileId: 'f1',
        table,
        isExpressionTable: false,
        reloadTable,
        setLoaderOptions,
        ...overrides
    };
}

function setup(context: TableDataCommandContext | null = makeContext()) {
    return renderHook(() => useTableDataCommands(() => context));
}

const run = async (
    result: { current: (command: TableDataCommand) => Promise<void> },
    command: TableDataCommand
) => {
    await act(() => result.current(command));
};

const sentChannels = () => electronAPI.send.mock.calls.map((c) => c[0]);

beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(listeners)) {
        delete listeners[key];
    }
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
        cb();
        return 0;
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    Object.assign(window, { electronAPI });
    electronAPI.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: 'C:/out.xlsx'
    });
    electronAPI.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['C:/in.xlsx']
    });
    electronAPI.preferences.getValue.mockResolvedValue([false]);
    electronAPI.externalData.import.mockResolvedValue([{ A: 2 }]);
    electronAPI.externalData.importBulk.mockResolvedValue({ success: true });
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('useTableDataCommands', () => {
    describe('export', () => {
        it('does nothing when the dialog is cancelled', async () => {
            electronAPI.showSaveDialog.mockResolvedValue({ canceled: true });
            const { result } = setup();
            await run(result, 'export');
            expect(electronAPI.externalData.export).not.toHaveBeenCalled();
            expect(setLoaderOptions).not.toHaveBeenCalled();
            expect(electronAPI.send).not.toHaveBeenCalled();
        });

        it('exports the table rows', async () => {
            const { result } = setup();
            await run(result, 'export');
            expect(electronAPI.showSaveDialog).toHaveBeenCalledWith(
                expect.objectContaining({ defaultPath: 'Player' })
            );
            expect(electronAPI.externalData.export).toHaveBeenCalledWith(
                'C:/out.xlsx',
                ['A', 'B'],
                [[1, '']]
            );
            expect(sentChannels()).toEqual(['exporting', 'exported']);
            expect(setLoaderOptions).toHaveBeenNthCalledWith(1, {
                message: 'Exporting...',
                show: true
            });
            expect(setLoaderOptions).toHaveBeenLastCalledWith({ show: false });
        });

        it('opens the file only when the preference is on', async () => {
            const { result } = setup();
            await run(result, 'export');
            expect(sentChannels()).not.toContain('open-path');

            electronAPI.preferences.getValue.mockResolvedValue([true]);
            await run(result, 'export');
            expect(electronAPI.send).toHaveBeenCalledWith(
                'open-path',
                'C:/out.xlsx'
            );
        });

        it('shows an error box on failure', async () => {
            electronAPI.preferences.getValue.mockResolvedValue([true]);
            electronAPI.externalData.export.mockRejectedValue(
                new Error('EBUSY')
            );
            const { result } = setup();
            await run(result, 'export');
            expect(sentChannels()).toEqual(['exporting', 'export-error']);
            expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'error',
                    title: 'Unable to export',
                    detail: 'EBUSY'
                })
            );
            expect(setLoaderOptions).toHaveBeenLastCalledWith({ show: false });
        });
    });

    describe('import', () => {
        it('imports the rows and reloads the table', async () => {
            const { result } = setup();
            await run(result, 'import');
            expect(electronAPI.externalData.import).toHaveBeenCalledWith(
                'C:/in.xlsx'
            );
            expect(electronAPI.externalData.importBulk).toHaveBeenCalledWith(
                'f1',
                7,
                [{ A: 2 }]
            );
            expect(reloadTable).toHaveBeenCalledTimes(1);
            expect(sentChannels()).toEqual(['importing', 'imported']);
        });

        it('does not reload on failure', async () => {
            electronAPI.externalData.importBulk.mockRejectedValue(
                new Error('bad row')
            );
            const { result } = setup();
            await run(result, 'import');
            expect(reloadTable).not.toHaveBeenCalled();
            expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Unable to import',
                    message: 'Unable to import the table. Error: bad row'
                })
            );
        });
    });

    it('exports the raw table', async () => {
        const { result } = setup();
        await run(result, 'exportRawTable');
        expect(electronAPI.externalData.rawExport).toHaveBeenCalledWith(
            'f1',
            7,
            'C:/out.xlsx'
        );
    });

    it('exports the FRT file', async () => {
        const { result } = setup();
        await run(result, 'exportFrt');
        expect(electronAPI.showSaveDialog).toHaveBeenCalledWith(
            expect.objectContaining({ defaultPath: undefined })
        );
        expect(electronAPI.externalData.frtExport).toHaveBeenCalledWith(
            'f1',
            'C:/out.xlsx'
        );
    });

    it('imports the raw table and reloads', async () => {
        const { result } = setup();
        await run(result, 'importRawTable');
        expect(electronAPI.externalData.rawImport).toHaveBeenCalledWith(
            'f1',
            7,
            'C:/in.xlsx'
        );
        expect(reloadTable).toHaveBeenCalledTimes(1);
    });

    it('adds the menu listeners once and removes them on unmount', async () => {
        const { unmount, rerender } = setup();
        rerender();
        expect(electronAPI.on).toHaveBeenCalledTimes(7);
        expect(Object.keys(listeners).sort()).toEqual(
            [
                'copy-unique-id',
                'export-file',
                'export-frt',
                'export-raw-table',
                'import-file',
                'import-raw-table',
                'log-table'
            ].sort()
        );

        await act(async () => {
            listeners['export-frt']();
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(electronAPI.externalData.frtExport).toHaveBeenCalled();

        unmount();
        expect(electronAPI.removeAllListeners).toHaveBeenCalledTimes(7);
        expect(electronAPI.removeAllListeners).toHaveBeenCalledWith(
            'export-file'
        );
    });

    it('ignores a command while another is running', async () => {
        let resolveDialog: (value: unknown) => void = () => {};
        electronAPI.showSaveDialog.mockReturnValue(
            new Promise((resolve) => {
                resolveDialog = resolve;
            })
        );
        const { result } = setup();
        await act(async () => {
            const first = result.current('export');
            await result.current('export');
            resolveDialog({ canceled: false, filePath: 'C:/out.xlsx' });
            await first;
        });
        expect(electronAPI.showSaveDialog).toHaveBeenCalledTimes(1);
        expect(electronAPI.externalData.export).toHaveBeenCalledTimes(1);
    });

    it('skips spreadsheet export/import for expression tables', async () => {
        const { result } = setup(makeContext({ isExpressionTable: true }));
        await run(result, 'export');
        await run(result, 'import');
        expect(electronAPI.showSaveDialog).not.toHaveBeenCalled();
        expect(electronAPI.showOpenDialog).not.toHaveBeenCalled();

        await run(result, 'exportRawTable');
        expect(electronAPI.externalData.rawExport).toHaveBeenCalled();
    });

    it('does nothing without a loaded table', async () => {
        const { result } = setup(null);
        await run(result, 'export');
        await run(result, 'logTable');
        expect(electronAPI.showSaveDialog).not.toHaveBeenCalled();
        expect(console.log).not.toHaveBeenCalled();
    });

    it('logs the table', async () => {
        const { result } = setup();
        await run(result, 'logTable');
        expect(console.log).toHaveBeenCalledWith(table);
    });

    it('copies the unique ID', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        vi.stubGlobal('navigator', { clipboard: { writeText } });
        const { result } = setup();
        await run(result, 'copyUniqueId');
        expect(writeText).toHaveBeenCalledWith('1234');
    });
});
