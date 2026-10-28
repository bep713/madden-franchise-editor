import { ReactNode } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FileMetadata, FileType } from '@shared/types';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import { useEditorTabsController } from './EditorTabsContext';
import { EditorTab, tabName } from './editorTabs';

function makeFile(fileId: string): OpenFranchiseFile {
    return {
        fileId,
        metadata: {
            gameYear: 22,
            format: FileType.FRANCHISE,
            type: { gameType: 'madden' }
        } as FileMetadata,
        tables: []
    };
}

// `current.file` is read at render time, so tests can open and close files
function setup(current: { file: OpenFranchiseFile | undefined }) {
    return renderHook(
        () => ({
            tabs: useEditorTabsController(),
            pathname: useLocation().pathname
        }),
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <MemoryRouter>
                    <FranchiseFileContext.Provider
                        value={[current.file, undefined]}
                    >
                        {children}
                    </FranchiseFileContext.Provider>
                </MemoryRouter>
            )
        }
    );
}

const names = (tabs: EditorTab[]) => tabs.map(tabName);

describe('useEditorTabsController', () => {
    it('opens the table editor for a file the context does not have yet', () => {
        const current: { file: OpenFranchiseFile | undefined } = {
            file: undefined
        };
        const { result, rerender } = setup(current);
        expect(names(result.current.tabs.tabs)).toEqual(['Home']);

        const file = makeFile('file-1');
        act(() => {
            result.current.tabs.openTableEditor(file);
        });
        current.file = file;
        rerender();

        expect(names(result.current.tabs.tabs)).toEqual([
            'Home',
            'Schedule',
            'Schemas',
            'New Tab'
        ]);
        expect(result.current.tabs.activeTab.kind).toBe('table');
        expect(result.current.pathname).toBe('/table-editor');
    });

    it('shows only Home after the file is closed', () => {
        const current: { file: OpenFranchiseFile | undefined } = {
            file: makeFile('file-1')
        };
        const { result, rerender } = setup(current);
        act(() => {
            result.current.tabs.openTableEditor();
            result.current.tabs.newTab();
        });
        expect(result.current.tabs.tabs).toHaveLength(5);

        current.file = undefined;
        rerender();
        expect(names(result.current.tabs.tabs)).toEqual(['Home']);
        expect(result.current.tabs.activeTab.key).toBe('home');
    });

    it('goes Home from a table tab, and stays put for a stub tab', () => {
        const { result } = setup({ file: makeFile('file-1') });
        act(() => {
            result.current.tabs.openTableEditor();
        });
        expect(result.current.pathname).toBe('/table-editor');

        act(() => {
            result.current.tabs.selectTab('schedule-editor');
        });
        expect(result.current.pathname).toBe('/table-editor');

        act(() => {
            result.current.tabs.selectTab('home');
        });
        expect(result.current.pathname).toBe('/');
    });

    it('drops a tab view state when the tab is closed', () => {
        const { result } = setup({ file: makeFile('file-1') });
        act(() => {
            result.current.tabs.openTableEditor();
        });
        const key = result.current.tabs.activeTab.key;
        result.current.tabs.setViewState(key, {
            selection: { row: 5, col: 1 }
        });
        result.current.tabs.setViewState(key, {
            scroll: { top: 10, left: 0 }
        });
        expect(result.current.tabs.getViewState(key)).toEqual({
            selection: { row: 5, col: 1 },
            scroll: { top: 10, left: 0 }
        });

        act(() => {
            result.current.tabs.closeTab(key);
        });
        expect(result.current.tabs.getViewState(key)).toBeUndefined();
        expect(result.current.pathname).toBe('/');
    });

    it('seeds a new table tab with the selection, leaving the current tab alone', () => {
        const { result } = setup({ file: makeFile('file-1') });
        act(() => {
            result.current.tabs.openTableEditor();
        });
        const current = result.current.tabs.activeTab.key;
        result.current.tabs.setViewState(current, {
            selection: { row: 3, col: 2 }
        });

        act(() => {
            result.current.tabs.openTableTab(4104, 'Stadium', {
                selection: { row: 12, col: 0 },
                background: true
            });
        });
        expect(result.current.tabs.activeTab.key).toBe(current);
        const added = result.current.tabs.tabs.at(-1)!;
        expect(tabName(added)).toBe('4104 - Stadium');
        expect(result.current.tabs.getViewState(added.key)).toEqual({
            selection: { row: 12, col: 0 }
        });
        expect(result.current.tabs.getViewState(current)).toEqual({
            selection: { row: 3, col: 2 }
        });

        act(() => {
            result.current.tabs.openTableTab(7482, 'Team');
        });
        expect(tabName(result.current.tabs.activeTab)).toBe('7482 - Team');
        expect(
            result.current.tabs.getViewState(result.current.tabs.activeTab.key)
        ).toBeUndefined();
        expect(result.current.pathname).toBe('/table-editor');
    });
});
