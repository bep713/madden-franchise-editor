import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SchemaFilesCard, {
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

beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(window, { electronAPI: { files: { getPathForFile } } });
});

describe('SchemaFilesCard', () => {
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
        expect(onRemove).toHaveBeenCalledWith('C:\\game\\Teams.FTX');
    });

    it('lists the still-needed includes', () => {
        setup([], ['NESTED.FTX']);
        expect(screen.getByTestId('still-needed').textContent).toContain(
            'NESTED.FTX'
        );
    });

    it('shows the first files of a big folder, and the rest on request', async () => {
        const rows: FileRow[] = Array.from({ length: 25 }, (_, i) => ({
            path: `C:\\game\\F${i}.FTX`,
            name: `F${i}.FTX`,
            role: 'include',
            problems: []
        }));
        setup(rows);
        const files = () =>
            screen
                .getByRole('list', { name: 'Files' })
                .querySelectorAll('li[data-name]').length;
        expect(files()).toBe(VISIBLE_FILES);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show 15 more' })
        );
        expect(files()).toBe(25);
        await userEvent.click(
            screen.getByRole('button', { name: 'Show fewer' })
        );
        expect(files()).toBe(VISIBLE_FILES);
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
