import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Problem } from '@shared/types';
import SchemaFilesCard, {
    FOLDER_PAGE,
    type FileRow,
    VISIBLE_FILES,
    VISIBLE_MISSING
} from './SchemaFilesCard';

const getPathForFile = vi.fn((file: File) =>
    file.name === 'no-path' ? '' : `C:\\drop\\${file.name}`
);

function setup(rows: FileRow[] = [], missing: string[] = []) {
    const props = {
        onAddPaths: vi.fn(),
        onBrowse: vi.fn(),
        onRemove: vi.fn()
    };
    render(<SchemaFilesCard missing={missing} rows={rows} {...props} />);
    return props;
}

const zone = (): HTMLElement => screen.getByTestId('drop-zone');
const search = (): HTMLInputElement =>
    screen.getByRole('textbox', { name: 'Search files' });
const rowCount = (): number =>
    screen
        .getByRole('list', { name: 'Files' })
        .querySelectorAll('li[data-name]').length;

function row(path: string, role: FileRow['role'] = 'include'): FileRow {
    return { path, name: path.split('\\').pop() ?? path, role, problems: [] };
}

function folderRows(folder: string, n: number): FileRow[] {
    return Array.from({ length: n }, (_, i) => row(`${folder}\\F${i}.FTX`));
}

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { electronAPI: { files: { getPathForFile } } });
});

describe('SchemaFilesCard', () => {
    describe('entry', () => {
        function setupEntry(rows: FileRow[], entryChosen = false) {
            const onSetEntry = vi.fn();
            render(
                <SchemaFilesCard
                    entryChosen={entryChosen}
                    missing={[]}
                    onAddPaths={vi.fn()}
                    onBrowse={vi.fn()}
                    onRemove={vi.fn()}
                    onSetEntry={onSetEntry}
                    rows={rows}
                />
            );
            return onSetEntry;
        }

        it('offers Make entry on include and unused FTX rows only', async () => {
            const onSetEntry = setupEntry([
                row('C:\\a\\MAIN.FTX', 'entry'),
                row('C:\\b\\Teams.FTX', 'include'),
                row('C:\\c\\Other.FTX', 'unused'),
                row('C:\\d\\notes.txt', 'invalid'),
                // Not planned yet
                { ...row('C:\\e\\Pending.FTX'), role: undefined }
            ]);
            const buttons = screen.getAllByRole('button', {
                name: /^Make .* the entry$/
            });
            expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
                'Make Teams.FTX the entry',
                'Make Other.FTX the entry'
            ]);
            expect(
                screen.queryByRole('button', { name: 'Use detected' })
            ).toBeNull();
            expect(screen.getByText('Entry').getAttribute('title')).toBe(
                'Detected from the includes'
            );
            await userEvent.click(buttons[1]);
            expect(onSetEntry).toHaveBeenCalledWith('C:\\c\\Other.FTX');
        });

        it('goes back to the detected entry from a chosen one', async () => {
            const onSetEntry = setupEntry(
                [
                    row('C:\\a\\Other.FTX', 'entry'),
                    row('C:\\b\\MAIN.FTX', 'unused')
                ],
                true
            );
            expect(screen.getByText('Entry').getAttribute('title')).toBe(
                'Chosen by you'
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Use detected' })
            );
            expect(onSetEntry).toHaveBeenCalledWith(undefined);
        });

        it('offers Make entry inside an expanded folder', async () => {
            const onSetEntry = setupEntry(folderRows('C:\\f', 3));
            await userEvent.click(
                screen.getByRole('button', { name: 'Expand' })
            );
            await userEvent.click(
                screen.getByRole('button', { name: 'Make F1.FTX the entry' })
            );
            expect(onSetEntry).toHaveBeenCalledWith('C:\\f\\F1.FTX');
        });
    });

    it('adds dropped files by their paths', () => {
        const { onAddPaths } = setup();
        const files = [
            new File([''], 'MAIN.FTX'),
            new File([''], 'no-path'),
            new File([''], 'Teams.FTX')
        ];
        fireEvent.dragOver(zone(), { dataTransfer: { files } });
        expect(zone().dataset.dragging).toBe('true');
        fireEvent.drop(zone(), { dataTransfer: { files } });
        expect(zone().dataset.dragging).toBe('false');
        expect(onAddPaths).toHaveBeenCalledWith([
            'C:\\drop\\MAIN.FTX',
            'C:\\drop\\Teams.FTX'
        ]);
    });

    it('stops showing the drag when it leaves', () => {
        setup();
        fireEvent.dragOver(zone(), { dataTransfer: { files: [] } });
        fireEvent.dragLeave(zone(), { relatedTarget: document.body });
        expect(zone().dataset.dragging).toBe('false');
    });

    it('keeps a drop outside the zone from loading the file', () => {
        setup();
        const event = new Event('drop', { cancelable: true });
        window.dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it('browses for files or a folder', async () => {
        const { onBrowse } = setup();
        await userEvent.click(
            screen.getByRole('button', { name: 'Choose files' })
        );
        await userEvent.click(
            screen.getByRole('button', { name: 'Choose folder' })
        );
        expect(onBrowse.mock.calls).toEqual([['files'], ['folder']]);
    });

    it('shows a row per file of a folder, each removable', async () => {
        const rows: FileRow[] = ['MAIN.FTX', 'Teams.FTX'].map((name) => ({
            path: `C:\\game\\${name}`,
            name,
            role: name === 'MAIN.FTX' ? 'entry' : 'include',
            problems: []
        }));
        const { onRemove } = setup(rows);
        const items = screen.getAllByRole('listitem');
        expect(items.map((item) => item.dataset.path)).toEqual([
            'C:\\game\\MAIN.FTX',
            'C:\\game\\Teams.FTX'
        ]);
        expect(items.map((item) => item.dataset.role)).toEqual([
            'entry',
            'include'
        ]);
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove Teams.FTX' })
        );
        expect(onRemove).toHaveBeenCalledWith(['C:\\game\\Teams.FTX']);
    });

    it('lists the still-needed includes', () => {
        setup([], ['NESTED.FTX']);
        expect(screen.getByTestId('still-needed').textContent).toContain(
            'NESTED.FTX'
        );
    });

    it('collapses a big folder into one line, and expands it', async () => {
        setup(folderRows('C:\\game', 25));
        const list = screen.getByRole('list', { name: 'Files' });
        expect(list.querySelectorAll(':scope > li')).toHaveLength(1);
        const line = list.querySelector('li[data-folder]') as HTMLElement;
        expect(line.dataset.folder).toBe('C:\\game');
        expect(line.dataset.count).toBe('25');
        expect(line.dataset.planned).toBe('true');
        expect(line.textContent).toContain('25 files');
        expect(rowCount()).toBe(0);

        await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
        const nested = screen.getByRole('list', { name: 'Files in C:\\game' });
        expect(nested.querySelectorAll('li[data-name]')).toHaveLength(25);
        const toggle = screen.getByRole('button', { name: 'Collapse' });
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(toggle.getAttribute('aria-controls')).toBe(nested.id);

        await userEvent.click(toggle);
        expect(rowCount()).toBe(0);
        expect(screen.getByRole('button', { name: 'Expand' })).toBeTruthy();
    });

    it('renders a huge expanded folder a page at a time', async () => {
        const total = FOLDER_PAGE * 2 + 5;
        setup(folderRows('C:\\game', total));
        await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
        expect(rowCount()).toBe(FOLDER_PAGE);

        await userEvent.click(
            screen.getByRole('button', {
                name: `Show ${FOLDER_PAGE} more of ${total - FOLDER_PAGE}`
            })
        );
        expect(rowCount()).toBe(FOLDER_PAGE * 2);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 5 more of 5' })
        );
        expect(rowCount()).toBe(total);
        expect(
            document.querySelector('[data-action="show-more-folder"]')
        ).toBeNull();
    });

    it('groups folders and leaves a lone file as a plain row', () => {
        setup([
            ...folderRows('C:\\a', 3),
            ...folderRows('C:\\b', 2),
            row('C:\\c\\LONE.FTX')
        ]);
        const list = screen.getByRole('list', { name: 'Files' });
        expect(
            Array.from(
                list.querySelectorAll<HTMLElement>(':scope > li[data-folder]')
            ).map((li) => li.dataset.folder)
        ).toEqual(['C:\\a', 'C:\\b']);
        expect(
            Array.from(
                list.querySelectorAll<HTMLElement>(':scope > li[data-name]')
            ).map((li) => li.dataset.name)
        ).toEqual(['LONE.FTX']);
    });

    it('counts top-level lines for the cap', async () => {
        setup(Array.from({ length: 12 }, (_, i) => row(`C:\\d${i}\\F.FTX`)));
        expect(rowCount()).toBe(VISIBLE_FILES);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 2 more' })
        );
        expect(rowCount()).toBe(12);
    });

    it('shows a child problem on the collapsed line', () => {
        const rows = folderRows('C:\\game', 3);
        rows[1].problems = [
            {
                code: 'unreadable',
                severity: 'blocking',
                path: rows[1].path
            } as Problem
        ];
        setup(rows);
        const badge = screen.getByText('1 problem');
        expect(badge.dataset.severity).toBe('blocking');
    });

    it('marks a folder unplanned until every file has a role', () => {
        const rows = folderRows('C:\\game', 3);
        rows[2].role = undefined;
        setup(rows);
        const line = screen
            .getByRole('list', { name: 'Files' })
            .querySelector('li[data-folder]') as HTMLElement;
        expect(line.dataset.planned).toBe('false');
    });

    it('filters by name and counts the matches in a folder', async () => {
        setup([...folderRows('C:\\game', 13), row('C:\\other\\Teams.FTX')]);
        await userEvent.type(search(), 'f1');
        // F1, F10, F11, F12
        expect(screen.getByTestId('folder-count').textContent).toBe(
            '4 of 13 files'
        );
        expect(screen.queryByText('Teams.FTX')).toBeNull();
        await userEvent.click(screen.getByRole('button', { name: 'Expand' }));
        expect(rowCount()).toBe(4);

        await userEvent.clear(search());
        await userEvent.type(search(), 'nothing');
        expect(screen.getByTestId('no-matches').textContent).toBe(
            'No files match \u201cnothing\u201d.'
        );
    });

    it('removes every file of a folder, including ones the search hides', async () => {
        const rows = folderRows('C:\\game', 3);
        const { onRemove } = setup(rows);
        await userEvent.type(search(), 'F0');
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove all files in C:\\game' })
        );
        expect(onRemove).toHaveBeenCalledWith(rows.map((r) => r.path));
    });

    it('removes all files and clears the search', async () => {
        const rows = [...folderRows('C:\\a', 2), row('C:\\b\\B.FTX')];
        const { onRemove } = setup(rows);
        await userEvent.type(search(), 'zzz');
        await userEvent.click(
            screen.getByRole('button', { name: 'Remove all' })
        );
        expect(onRemove).toHaveBeenCalledWith(rows.map((r) => r.path));
        expect(search().value).toBe('');
    });

    it('counts a long still-needed list and shows the rest on request', async () => {
        const missing = Array.from({ length: 1205 }, (_, i) => `M${i}.FTX`);
        setup([], missing);
        const section = screen.getByTestId('still-needed');
        const names = () => section.querySelectorAll('li[data-name]').length;
        expect(section.textContent).toContain('Still needed (1,205 files,');
        expect(names()).toBe(VISIBLE_MISSING);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 1,200 more' })
        );
        expect(names()).toBe(1205);
    });

    it('has no toggle when everything fits', () => {
        setup([], ['A.FTX', 'B.FTX']);
        expect(screen.queryByRole('button', { name: /^Show/ })).toBeNull();
        expect(screen.getByTestId('still-needed').textContent).toContain(
            'Still needed (included by the files above):'
        );
    });
});
