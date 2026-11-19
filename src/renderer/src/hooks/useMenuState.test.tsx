import { ReactNode } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    FranchiseFileContext,
    OpenFranchiseFile
} from '@renderer/context/FranchiseFileContext';
import useMenuState, { REACT_MENU_IDS } from './useMenuState';

const send = vi.fn();

const file = {
    fileId: 'f1',
    metadata: {},
    tables: []
} as unknown as OpenFranchiseFile;

function setup(path: string, openFile: OpenFranchiseFile | undefined) {
    return renderHook(
        () => {
            useMenuState();
            return useNavigate();
        },
        {
            wrapper: ({ children }: { children: ReactNode }) => (
                <MemoryRouter initialEntries={[path]}>
                    <FranchiseFileContext.Provider
                        value={[openFile, undefined]}
                    >
                        {children}
                    </FranchiseFileContext.Provider>
                </MemoryRouter>
            )
        }
    );
}

const sent = (channel: string) =>
    send.mock.calls.filter((c) => c[0] === channel).map((c) => c[1]);

beforeEach(() => {
    send.mockReset();
    Object.assign(window, { electronAPI: { send } });
});

describe('useMenuState', () => {
    it('enables the table editor items with a file', () => {
        setup('/table-editor', file);
        expect(sent('menu:enable').flat().sort()).toEqual(
            [...REACT_MENU_IDS].sort()
        );
        expect(sent('menu:disable')).toEqual([]);
    });

    it('disables the table editor items without a file', () => {
        setup('/table-editor', undefined);
        expect(sent('menu:enable')).toEqual([]);
        const disabled = sent('menu:disable').flat();
        for (const id of REACT_MENU_IDS) {
            expect(disabled).toContain(id);
        }
    });

    it('disables Save on Home', () => {
        setup('/', file);
        expect(sent('menu:enable')).toEqual([]);
        expect(sent('menu:disable').flat()).toContain('Save');
    });

    it('does nothing on an unknown path', () => {
        setup('/nowhere', file);
        expect(send).not.toHaveBeenCalled();
    });

    it('re-runs when the path changes', () => {
        const { result } = setup('/', file);
        expect(sent('menu:enable')).toEqual([]);
        act(() => result.current('/table-editor'));
        expect(sent('menu:enable').flat().sort()).toEqual(
            [...REACT_MENU_IDS].sort()
        );
    });
    it('uses the parent item on a sub-page', () => {
        setup('/table-editor/sub', file);
        expect(sent('menu:enable').flat().sort()).toEqual(
            [...REACT_MENU_IDS].sort()
        );
    });

    it('does not treat a lookalike path as a sub-page', () => {
        setup('/table-editor-x', file);
        expect(send).not.toHaveBeenCalled();
    });
});
