import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AddSchemaPlan, AddSchemaRequest } from '@shared/types';
import { DIR, generatePlan, plannedFile } from './testPlans';
import useAddSchema, { OPTION_DEBOUNCE_MS } from './useAddSchema';

const MAIN = `${DIR}\\MAIN.FTX`;
const TEAMS = `${DIR}\\Teams.FTX`;

const electronAPI = {
    showMessageBox: vi.fn(),
    showOpenDialog: vi.fn(),
    preferences: { getValue: vi.fn(async () => 'C:\\games') },
    schema: { inspectAdd: vi.fn(), add: vi.fn() }
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((r) => (resolve = r));
    return { promise, resolve };
}

const REPLACES = [
    { path: 'C:\\userData\\schemas\\M27_900_1.gz', loadedBy: [] }
];

async function setupWithFiles(plan: AddSchemaPlan = generatePlan()) {
    electronAPI.schema.inspectAdd.mockResolvedValue(plan);
    const hook = renderHook(() => useAddSchema());
    act(() => hook.result.current.addFiles([MAIN, TEAMS]));
    await waitFor(() => expect(hook.result.current.plan).toEqual(plan));
    return hook;
}

const lastRequest = (): AddSchemaRequest =>
    electronAPI.schema.inspectAdd.mock.calls.at(-1)![0];

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { electronAPI });
    electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useAddSchema', () => {
    it('inspects at once when files change', async () => {
        const { result } = await setupWithFiles();
        expect(lastRequest()).toEqual({
            files: [MAIN, TEAMS],
            overrides: {},
            includeDefaults: true
        });
        expect(result.current.inspecting).toBe(false);
    });

    it('adopts the expanded file list of a folder', async () => {
        const plan = generatePlan();
        electronAPI.schema.inspectAdd.mockResolvedValue(plan);
        const { result } = renderHook(() => useAddSchema());
        act(() => result.current.addFiles([DIR]));
        await waitFor(() =>
            expect(result.current.request.files).toEqual([MAIN, TEAMS])
        );
        expect(electronAPI.schema.inspectAdd).toHaveBeenCalledTimes(1);
    });

    it('is reading while added files are inspected, but not on an option change', async () => {
        const plan = generatePlan();
        const first = deferred<AddSchemaPlan>();
        electronAPI.schema.inspectAdd.mockReturnValueOnce(first.promise);
        const { result } = renderHook(() => useAddSchema());
        expect(result.current.reading).toBe(false);
        act(() => result.current.addFiles([MAIN, TEAMS]));
        expect(result.current.reading).toBe(true);
        await act(async () => first.resolve(plan));
        expect(result.current.reading).toBe(false);

        const second = deferred<AddSchemaPlan>();
        electronAPI.schema.inspectAdd.mockReturnValueOnce(second.promise);
        act(() => result.current.setIncludeDefaults(false));
        expect(result.current.inspecting).toBe(true);
        expect(result.current.reading).toBe(false);
        await act(async () => second.resolve(plan));
    });

    it('stops reading when the inspect fails', async () => {
        electronAPI.schema.inspectAdd.mockRejectedValueOnce(new Error('x'));
        const { result } = renderHook(() => useAddSchema());
        act(() => result.current.addFiles([MAIN]));
        await waitFor(() => expect(result.current.error).toBe('Error: x'));
        expect(result.current.reading).toBe(false);
    });

    it('waits for a pause in typing, then sends one inspect', async () => {
        const { result } = await setupWithFiles();
        vi.useFakeTimers();
        electronAPI.schema.inspectAdd.mockClear();
        act(() => result.current.setOverrides({ major: '9' }, true));
        act(() => result.current.setOverrides({ major: '90' }, true));
        expect(result.current.request.overrides).toEqual({ major: '90' });
        expect(result.current.inspecting).toBe(true);
        act(() => vi.advanceTimersByTime(OPTION_DEBOUNCE_MS - 1));
        expect(electronAPI.schema.inspectAdd).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(electronAPI.schema.inspectAdd).toHaveBeenCalledTimes(1);
        expect(lastRequest().overrides).toEqual({ major: '90' });
    });

    it('clears an override with undefined', async () => {
        const { result } = await setupWithFiles();
        act(() => result.current.setOverrides({ major: '1' }));
        act(() => result.current.setOverrides({ major: undefined }));
        expect(result.current.request.overrides).toEqual({});
        expect('major' in lastRequest().overrides).toBe(false);
    });

    it('drops a stale reply', async () => {
        const first = deferred<AddSchemaPlan>();
        const stale = generatePlan({ entry: 'stale' });
        const fresh = generatePlan({ entry: 'fresh' });
        electronAPI.schema.inspectAdd
            .mockReturnValueOnce(first.promise)
            .mockResolvedValueOnce(fresh);
        const { result } = renderHook(() => useAddSchema());
        act(() => result.current.addFiles([MAIN]));
        act(() => result.current.addFiles([TEAMS]));
        await waitFor(() => expect(result.current.plan?.entry).toBe('fresh'));
        await act(async () => first.resolve(stale));
        expect(result.current.plan?.entry).toBe('fresh');
    });

    it('shows an inspect error and leaves no plan', async () => {
        electronAPI.schema.inspectAdd.mockResolvedValue({ error: 'boom' });
        const { result } = renderHook(() => useAddSchema());
        act(() => result.current.addFiles([MAIN]));
        await waitFor(() => expect(result.current.error).toBe('boom'));
        expect(result.current.plan).toBeNull();
    });

    it('sends a chosen entry, and drops it with its file or on reset', async () => {
        const { result } = await setupWithFiles();
        act(() => result.current.setEntry(TEAMS));
        expect(lastRequest().entry).toBe(TEAMS);
        expect(result.current.request.entry).toBe(TEAMS);

        act(() => result.current.removeFiles([MAIN]));
        expect(lastRequest()).toEqual({
            files: [TEAMS],
            overrides: {},
            includeDefaults: true,
            entry: TEAMS
        });

        act(() => result.current.setEntry(undefined));
        expect('entry' in lastRequest()).toBe(false);

        act(() => result.current.setEntry(TEAMS));
        act(() => result.current.addFiles([MAIN]));
        act(() => result.current.removeFiles([TEAMS]));
        expect('entry' in lastRequest()).toBe(false);
        await waitFor(() => expect(result.current.inspecting).toBe(false));
    });

    it('sends nothing once every file is removed', async () => {
        const { result } = await setupWithFiles();
        electronAPI.schema.inspectAdd.mockClear();
        act(() => result.current.removeFiles([MAIN]));
        act(() => result.current.removeFiles([TEAMS]));
        expect(result.current.plan).toBeNull();
        expect(electronAPI.schema.inspectAdd).toHaveBeenCalledTimes(1);
    });

    it('browses for several files from the default directory', async () => {
        electronAPI.schema.inspectAdd.mockResolvedValue(generatePlan());
        electronAPI.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [MAIN, TEAMS]
        });
        const { result } = renderHook(() => useAddSchema());
        await act(() => result.current.browse('files'));
        expect(electronAPI.showOpenDialog).toHaveBeenCalledWith(
            expect.objectContaining({
                defaultPath: 'C:\\games',
                properties: ['openFile', 'multiSelections']
            })
        );
        expect(result.current.request.files).toEqual([MAIN, TEAMS]);
    });

    describe('add', () => {
        const added = {
            identity: {
                gameType: 'madden',
                gameYear: 27,
                major: 900,
                minor: 1
            },
            fileName: 'M27_900_1.gz',
            path: REPLACES[0].path,
            replaced: false,
            loadedBy: [],
            warnings: []
        };

        it('adds without asking when nothing is missing or replaced', async () => {
            electronAPI.schema.add.mockResolvedValue({
                status: 'added',
                added
            });
            const { result } = await setupWithFiles();
            let value: unknown;
            await act(async () => {
                value = await result.current.add();
            });
            expect(value).toEqual(added);
            expect(electronAPI.showMessageBox).not.toHaveBeenCalled();
            expect(electronAPI.schema.add).toHaveBeenCalledWith({
                files: [MAIN, TEAMS],
                overrides: {},
                includeDefaults: true,
                acceptMissing: [],
                confirmedTarget: { fileName: 'M27_900_1.gz', replaces: [] }
            });
        });

        it('confirms missing includes and sends the names seen', async () => {
            electronAPI.schema.add.mockResolvedValue({
                status: 'added',
                added
            });
            const { result } = await setupWithFiles(
                generatePlan({ missing: ['NESTED.FTX'] })
            );
            await act(() => result.current.add());
            expect(electronAPI.showMessageBox).toHaveBeenCalledTimes(1);
            expect(electronAPI.showMessageBox.mock.calls[0][0].message).toBe(
                'Generate without NESTED.FTX?'
            );
            expect(
                electronAPI.schema.add.mock.calls[0][0].acceptMissing
            ).toEqual(['NESTED.FTX']);
        });

        it('confirms a replace and sends the paths seen', async () => {
            electronAPI.schema.add.mockResolvedValue({
                status: 'added',
                added
            });
            const { result } = await setupWithFiles(
                generatePlan({
                    target: { ...generatePlan().target!, replaces: REPLACES }
                })
            );
            await act(() => result.current.add());
            expect(electronAPI.showMessageBox.mock.calls[0][0].message).toBe(
                'Replace your custom M27 900.1?'
            );
            expect(
                electronAPI.schema.add.mock.calls[0][0].confirmedTarget
            ).toEqual({
                fileName: 'M27_900_1.gz',
                replaces: [REPLACES[0].path]
            });
        });

        it('asks once when both apply', async () => {
            electronAPI.schema.add.mockResolvedValue({
                status: 'added',
                added
            });
            const { result } = await setupWithFiles(
                generatePlan({
                    missing: ['NESTED.FTX'],
                    target: { ...generatePlan().target!, replaces: REPLACES }
                })
            );
            await act(() => result.current.add());
            expect(electronAPI.showMessageBox).toHaveBeenCalledTimes(1);
            expect(electronAPI.showMessageBox.mock.calls[0][0].message).toBe(
                'Replace your custom M27 900.1 and generate without NESTED.FTX?'
            );
        });

        it('sends nothing when the confirmation is cancelled', async () => {
            electronAPI.showMessageBox.mockResolvedValue({ response: 1 });
            const { result } = await setupWithFiles(
                generatePlan({ missing: ['NESTED.FTX'] })
            );
            let value: unknown;
            await act(async () => {
                value = await result.current.add();
            });
            expect(value).toBeNull();
            expect(electronAPI.schema.add).not.toHaveBeenCalled();
        });

        it('is adding until main answers, and a second click sends nothing', async () => {
            const reply = deferred<unknown>();
            electronAPI.schema.add.mockReturnValue(reply.promise);
            const { result } = await setupWithFiles();
            let first!: Promise<unknown>;
            act(() => {
                first = result.current.add();
                void result.current.add();
            });
            await waitFor(() => expect(result.current.adding).toBe(true));
            await act(async () => {
                reply.resolve({ status: 'added', added });
                await first;
            });
            expect(result.current.adding).toBe(false);
            expect(electronAPI.schema.add).toHaveBeenCalledTimes(1);
        });

        it('shows the blocked plan', async () => {
            const blocked = generatePlan({
                canAdd: false,
                problems: [{ code: 'target-changed', severity: 'blocking' }]
            });
            electronAPI.schema.add.mockResolvedValue({
                status: 'blocked',
                plan: blocked
            });
            const { result } = await setupWithFiles();
            let value: unknown;
            await act(async () => {
                value = await result.current.add();
            });
            expect(value).toBeNull();
            expect(result.current.plan).toEqual(blocked);
        });

        it('shows an error box when the add fails', async () => {
            electronAPI.schema.add.mockResolvedValue({ error: 'disk full' });
            const { result } = await setupWithFiles();
            let value: unknown;
            await act(async () => {
                value = await result.current.add();
            });
            expect(value).toBeNull();
            expect(electronAPI.showMessageBox).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'error', detail: 'disk full' })
            );
        });

        it('does nothing while a plan is blocked', async () => {
            const { result } = await setupWithFiles(
                generatePlan({
                    canAdd: false,
                    files: [plannedFile('MAIN.FTX', 'entry')]
                })
            );
            await act(() => result.current.add());
            expect(electronAPI.schema.add).not.toHaveBeenCalled();
        });
    });
});
