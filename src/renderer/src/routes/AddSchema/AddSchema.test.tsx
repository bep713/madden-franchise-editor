import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
    AddSchemaPlan,
    AddSchemaRequest,
    PlannedFile
} from '@shared/types';
import AddSchema from './AddSchema';
import { DIR, generatePlan, gzPlan, option, plannedFile } from './testPlans';

const electronAPI = {
    showMessageBox: vi.fn(),
    showOpenDialog: vi.fn(),
    preferences: { getValue: vi.fn(async () => undefined) },
    schema: { inspectAdd: vi.fn(), add: vi.fn() },
    files: { getPathForFile: vi.fn() }
};

// A plan whose rows are the request's files, so nothing is adopted
let planFor: (request: AddSchemaRequest) => AddSchemaPlan;

function rowsFor(
    request: AddSchemaRequest,
    roles: Record<string, PlannedFile['role']>
): PlannedFile[] {
    return request.files.map((path) => {
        const name = path.split('\\').pop()!;
        return { ...plannedFile(name, roles[name] ?? 'include'), path };
    });
}

function SchemasPage() {
    const state = useLocation().state as { added?: { fileName: string } };
    return <p>Schemas page {state?.added?.fileName}</p>;
}

function setup() {
    return render(
        <MemoryRouter initialEntries={['/schema-management/add']}>
            <Routes>
                <Route element={<AddSchema />} path='/schema-management/add' />
                <Route element={<SchemasPage />} path='/schema-management' />
            </Routes>
        </MemoryRouter>
    );
}

async function choose(...names: string[]): Promise<void> {
    electronAPI.showOpenDialog.mockResolvedValueOnce({
        canceled: false,
        filePaths: names.map((name) => `${DIR}\\${name}`)
    });
    const calls = electronAPI.schema.inspectAdd.mock.calls.length;
    await userEvent.click(screen.getByRole('button', { name: 'Choose files' }));
    await waitFor(() =>
        expect(electronAPI.schema.inspectAdd.mock.calls.length).toBe(calls + 1)
    );
}

const row = (name: string): HTMLElement =>
    document.querySelector<HTMLElement>(`[data-name="${name}"][data-path]`)!;
const fact = (key: string): string | null | undefined =>
    document.querySelector(`[data-fact="${key}"]`)?.textContent;
const addButton = (): HTMLButtonElement =>
    screen.getByRole('button', { name: 'Add schema' });
const gameSelect = (): HTMLSelectElement =>
    document.querySelector('select[data-field="game"]')!;
const advanced = (): HTMLElement | null =>
    screen.queryByRole('checkbox', { name: /Add default schemas/ });

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { electronAPI });
    electronAPI.showMessageBox.mockResolvedValue({ response: 0 });
    planFor = (request) =>
        generatePlan({
            files: rowsFor(request, { 'MAIN.FTX': 'entry' }),
            includeDefaults: request.includeDefaults
        });
    electronAPI.schema.inspectAdd.mockImplementation(
        async (request: AddSchemaRequest) => planFor(request)
    );
});

describe('AddSchema', () => {
    it('starts with Add disabled and a prompt for files', () => {
        setup();
        expect(addButton().disabled).toBe(true);
        expect(screen.getByTestId('add-summary').textContent).toMatch(
            /^Add an entry FTX/
        );
    });

    it('shows each row with its role and its own problems', async () => {
        planFor = (request) =>
            generatePlan({
                files: rowsFor(request, {
                    'MAIN.FTX': 'entry',
                    'notes.txt': 'invalid'
                }),
                problems: [
                    {
                        code: 'not-a-schema',
                        severity: 'blocking',
                        path: `${DIR}\\notes.txt`
                    }
                ],
                canAdd: false
            });
        setup();
        await choose('MAIN.FTX', 'Teams.FTX', 'notes.txt');
        await waitFor(() => expect(row('MAIN.FTX').dataset.role).toBe('entry'));
        expect(within(row('MAIN.FTX')).getByText('Entry')).toBeTruthy();
        expect(row('Teams.FTX').dataset.role).toBe('include');
        expect(
            row('notes.txt').querySelector('[data-problem="not-a-schema"]')
                ?.textContent
        ).toBe('Not a schema or FTX file.');
        // Only on its row
        expect(screen.queryByRole('list', { name: 'Problems' })).toBeNull();
        expect(addButton().disabled).toBe(true);
        expect(screen.getByTestId('add-summary').textContent).toBe(
            'Will generate M27_900_1.gz from 1 entry file and 1 include once the problems above are fixed.'
        );
    });

    it('enables Add for a clean plan and goes to the Schemas page after', async () => {
        electronAPI.schema.add.mockResolvedValue({
            status: 'added',
            added: { fileName: 'M27_900_1.gz' }
        });
        setup();
        await choose('MAIN.FTX', 'Teams.FTX');
        await waitFor(() => expect(addButton().disabled).toBe(false));
        expect(screen.getByTestId('add-summary').textContent).toBe(
            'Generates M27_900_1.gz from 1 entry file and 1 include.'
        );
        await userEvent.click(addButton());
        expect(
            await screen.findByText('Schemas page M27_900_1.gz')
        ).toBeTruthy();
    });

    it('removes a row and re-plans', async () => {
        setup();
        await choose('MAIN.FTX', 'Teams.FTX');
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove Teams.FTX' })
        );
        await waitFor(() => expect(row('Teams.FTX')).toBeNull());
        expect(
            electronAPI.schema.inspectAdd.mock.calls.at(-1)![0].files
        ).toEqual([`${DIR}\\MAIN.FTX`]);
    });

    it('lists the still-needed includes, with Add enabled', async () => {
        planFor = (request) =>
            generatePlan({
                files: rowsFor(request, { 'MAIN.FTX': 'entry' }),
                missing: ['NESTED.FTX'],
                problems: [
                    {
                        code: 'missing-include',
                        severity: 'warning',
                        files: ['NESTED.FTX']
                    }
                ]
            });
        setup();
        await choose('MAIN.FTX');
        const needed = await screen.findByTestId('still-needed');
        expect(within(needed).getByText('NESTED.FTX')).toBeTruthy();
        expect(
            document.querySelector('[data-problem="missing-include"]')
        ).toBeTruthy();
        expect(addButton().disabled).toBe(false);
    });

    it('shows the source of each pre-filled value', async () => {
        setup();
        await choose('MAIN.FTX');
        await waitFor(() =>
            expect(
                (
                    document.querySelector(
                        'input[data-field="major"]'
                    ) as HTMLInputElement
                ).value
            ).toBe('900')
        );
        expect(document.querySelector('[data-hint="major"]')?.textContent).toBe(
            'From MAIN.FTX'
        );
        expect(gameSelect().value).toBe('madden-27');
    });

    it('shows typed text and offers the detected value back', async () => {
        planFor = (request) =>
            generatePlan({
                files: rowsFor(request, { 'MAIN.FTX': 'entry' }),
                options: {
                    ...generatePlan().options,
                    major: option(900, {
                        overridden: request.overrides.major !== undefined
                    })
                }
            });
        setup();
        await choose('MAIN.FTX');
        const major = document.querySelector(
            'input[data-field="major"]'
        ) as HTMLInputElement;
        await waitFor(() => expect(major.value).toBe('900'));
        await userEvent.clear(major);
        await userEvent.type(major, '12');
        expect(major.value).toBe('12');
        const back = await screen.findByRole('button', { name: 'Use 900' });
        await userEvent.click(back);
        await waitFor(() => expect(major.value).toBe('900'));
        expect(screen.queryByRole('button', { name: 'Use 900' })).toBeNull();
    });

    it('lists the game candidates first', async () => {
        planFor = (request) =>
            generatePlan({
                files: rowsFor(request, { 'MAIN.FTX': 'entry' }),
                gameCandidates: [
                    { gameType: 'madden', gameYear: 28 },
                    { gameType: 'madden', gameYear: 27 }
                ],
                options: {
                    ...generatePlan().options,
                    game: option({ gameType: 'madden', gameYear: 28 })
                }
            });
        setup();
        await choose('MAIN.FTX');
        await waitFor(() => expect(gameSelect().value).toBe('madden-28'));
        const labels = Array.from(gameSelect().options).map((o) => o.text);
        expect(labels.slice(0, 2)).toEqual(['M28', 'Madden 27']);
        expect(labels.at(-1)).toBe('Other game…');
    });

    it('keeps "Use <detected>" while Other game… is open', async () => {
        setup();
        await choose('MAIN.FTX');
        await waitFor(() => expect(gameSelect().value).toBe('madden-27'));
        await userEvent.selectOptions(gameSelect(), 'other');
        expect(screen.getByTestId('other-game')).toBeTruthy();
        await userEvent.click(screen.getByRole('radio', { name: 'College' }));
        const year = document.querySelector(
            'input[data-field="game-year"]'
        ) as HTMLInputElement;
        await userEvent.clear(year);
        await userEvent.type(year, '30');
        await waitFor(() =>
            expect(
                electronAPI.schema.inspectAdd.mock.calls.at(-1)![0].overrides
            ).toEqual({ game: { gameType: 'college', year: '30' } })
        );
        expect(screen.getByTestId('other-game')).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: 'Use Madden 27' })
        );
        expect(screen.queryByTestId('other-game')).toBeNull();
        expect(gameSelect().value).toBe('madden-27');
    });

    it('picking a listed game overrides it, and the detected one clears it', async () => {
        setup();
        await choose('MAIN.FTX');
        await waitFor(() => expect(gameSelect().value).toBe('madden-27'));
        await userEvent.selectOptions(gameSelect(), 'madden-22');
        await waitFor(() =>
            expect(
                electronAPI.schema.inspectAdd.mock.calls.at(-1)![0].overrides
            ).toEqual({ game: { gameType: 'madden', year: '22' } })
        );
        await userEvent.selectOptions(gameSelect(), 'madden-27');
        await waitFor(() =>
            expect(
                electronAPI.schema.inspectAdd.mock.calls.at(-1)![0].overrides
            ).toEqual({})
        );
    });

    it('hides Advanced options for a gz and brings back its value for FTX', async () => {
        planFor = (request) =>
            request.files.some((f) => f.endsWith('.gz'))
                ? gzPlan({
                      files: rowsFor(request, { 'C27_468_2.gz': 'schema' })
                  })
                : generatePlan({
                      files: rowsFor(request, { 'MAIN.FTX': 'entry' })
                  });
        setup();
        await choose('MAIN.FTX');
        await userEvent.click(advanced()!);
        expect(
            document.querySelector('[data-problem="defaults-merged-at-load"]')
        ).toBeTruthy();
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove MAIN.FTX' })
        );
        await choose('C27_468_2.gz');
        await waitFor(() => expect(advanced()).toBeNull());
        expect(fact('tables')).toBe('1234');
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove C27_468_2.gz' })
        );
        await choose('MAIN.FTX');
        await waitFor(() => expect(advanced()).toBeTruthy());
        expect((advanced() as HTMLInputElement).checked).toBe(false);
        expect(
            electronAPI.schema.inspectAdd.mock.calls.at(-1)![0].includeDefaults
        ).toBe(false);
    });

    it('shows the facts of a gz, with — for Saves as while blocked', async () => {
        planFor = (request) =>
            gzPlan({
                files: rowsFor(request, { 'schema.gz': 'schema' }),
                facts: { tables: 12, fileMeta: null },
                options: {
                    game: option(null),
                    major: option(null),
                    minor: option(null)
                },
                gameCandidates: [],
                target: null,
                canAdd: false,
                problems: [
                    { code: 'game-required', severity: 'blocking' },
                    { code: 'version-required', severity: 'blocking' }
                ]
            });
        setup();
        await choose('schema.gz');
        await waitFor(() => expect(fact('saves-as')).toBe('—'));
        expect(fact('file')).toBe('schema.gz');
        expect(fact('format')).toBe('Compressed schema (.gz)');
        expect(fact('tables')).toBe('12');
        expect(fact('game')).toBe('None');
        expect(fact('version')).toBe('None');
        expect(fact('database-name')).toBe('None');
        const problems = screen.getByRole('list', { name: 'Problems' });
        expect(
            problems.querySelector('[data-problem="game-required"]')
                ?.textContent
        ).toBe('Choose the game.');
        expect(gameSelect().value).toBe('');
        expect(screen.getByTestId('add-summary').textContent).toBe(
            'Fix the problems above to add the schema.'
        );
    });

    it('shows a gz meta hint', async () => {
        planFor = (request) =>
            gzPlan({ files: rowsFor(request, { 'C27_468_2.gz': 'schema' }) });
        setup();
        await choose('C27_468_2.gz');
        await waitFor(() =>
            expect(
                document.querySelector('[data-hint="game"]')?.textContent
            ).toBe('From file meta')
        );
        expect(gameSelect().value).toBe('college-27');
        expect(fact('game')).toBe('CFB 27');
        expect(fact('version')).toBe('468.2');
        expect(fact('saves-as')).toBe('C27_468_2.gz');
    });

    it('shows a blocked result from Add', async () => {
        electronAPI.schema.add.mockResolvedValue({
            status: 'blocked',
            plan: generatePlan({
                files: rowsFor(
                    { files: [`${DIR}\\MAIN.FTX`] } as AddSchemaRequest,
                    { 'MAIN.FTX': 'entry' }
                ),
                canAdd: false,
                problems: [
                    {
                        code: 'malformed-xml',
                        severity: 'blocking',
                        path: `${DIR}\\MAIN.FTX`,
                        detail: 'line 3'
                    }
                ]
            })
        });
        setup();
        await choose('MAIN.FTX');
        await waitFor(() => expect(addButton().disabled).toBe(false));
        await userEvent.click(addButton());
        await waitFor(() =>
            expect(
                row('MAIN.FTX').querySelector('[data-problem="malformed-xml"]')
                    ?.textContent
            ).toBe('Not valid XML: line 3')
        );
        expect(addButton().disabled).toBe(true);
    });
});
