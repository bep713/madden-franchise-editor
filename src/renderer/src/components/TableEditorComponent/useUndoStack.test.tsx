import type { RefObject } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { HotTableRef } from '@handsontable/react-wrapper';
import {
    REDO_SOURCE,
    UNDO_SOURCE,
    type RecordChange
} from '@renderer/utils/cellWrites';
import { createOrientation, type GridOrientation } from './orientation';
import useUndoStack from './useUndoStack';

interface FakeShortcut {
    keys: string[][];
    callback: () => void;
    group: string;
}

function makeHot() {
    const shortcuts: FakeShortcut[] = [];
    const context = {
        addShortcuts: vi.fn((added: FakeShortcut[]) =>
            shortcuts.push(...added)
        ),
        removeShortcutsByGroup: vi.fn((group: string) => {
            for (let i = shortcuts.length - 1; i >= 0; i--) {
                if (shortcuts[i].group === group) shortcuts.splice(i, 1);
            }
        })
    };
    const hot = {
        isDestroyed: false,
        countRows: () => 100,
        countCols: () => 100,
        setDataAtCell: vi.fn(),
        selectCell: vi.fn(),
        getShortcutManager: () => ({ getContext: () => context })
    };
    return { hot, context, shortcuts };
}

const headerNames = ['A', 'B', 'C'];
const identityRows = {
    toPhysicalRow: (r: number) => r,
    toVisualRow: (r: number) => r
};

const change = (
    recordIndex: number,
    fieldIndex: number,
    oldValue: unknown,
    newValue: unknown
): RecordChange => ({
    cell: { recordIndex, fieldIndex },
    fieldName: headerNames[fieldIndex],
    oldValue,
    newValue
});

function setup() {
    const fake = makeHot();
    const hotRef = {
        current: { hotInstance: fake.hot }
    } as unknown as RefObject<HotTableRef>;
    const orientationRef: { current: GridOrientation } = {
        current: createOrientation(false, headerNames, identityRows)
    };
    const hook = renderHook(() => useUndoStack(hotRef, orientationRef));
    return { ...fake, orientationRef, hook };
}

describe('useUndoStack', () => {
    it('replays through the current orientation, with our sources', () => {
        const { hot, orientationRef, hook, shortcuts } = setup();
        hook.result.current.registerShortcuts();
        const [undo, redo] = shortcuts;

        hook.result.current.record([change(4, 1, 'old', 'new')]);
        // Recorded in the normal view, replayed inverted: [field, record + 1]
        orientationRef.current = createOrientation(
            true,
            headerNames,
            identityRows
        );

        undo.callback();
        expect(hot.setDataAtCell).toHaveBeenLastCalledWith(
            [[1, 5, 'old']],
            UNDO_SOURCE
        );
        redo.callback();
        expect(hot.setDataAtCell).toHaveBeenLastCalledWith(
            [[1, 5, 'new']],
            REDO_SOURCE
        );
    });

    it('selects the bounding range of the replayed cells', () => {
        const { hot, hook, shortcuts } = setup();
        hook.result.current.registerShortcuts();
        hook.result.current.record([
            change(2, 1, 'a', 'b'),
            change(5, 2, 'c', 'd'),
            change(3, 0, 'e', 'f')
        ]);
        shortcuts[0].callback();
        expect(hot.selectCell).toHaveBeenCalledWith(2, 0, 5, 2);
    });

    it('skips cells that no longer exist', () => {
        const { hot, hook, shortcuts } = setup();
        hook.result.current.registerShortcuts();
        hook.result.current.record([
            change(200, 0, 'a', 'b'),
            change(1, 0, 'c', 'd')
        ]);
        shortcuts[0].callback();
        expect(hot.setDataAtCell).toHaveBeenCalledWith(
            [[1, 0, 'c']],
            UNDO_SOURCE
        );
    });

    it('does nothing with an empty stack or after clear', () => {
        const { hot, hook, shortcuts } = setup();
        hook.result.current.registerShortcuts();
        shortcuts[0].callback();
        hook.result.current.record([change(1, 0, 'a', 'b')]);
        hook.result.current.clear();
        shortcuts[0].callback();
        expect(hot.setDataAtCell).not.toHaveBeenCalled();
    });

    it('registers the shortcuts once and removes them', () => {
        const { context, hook, shortcuts } = setup();
        const unregister = hook.result.current.registerShortcuts();
        expect(context.addShortcuts).toHaveBeenCalledTimes(1);
        expect(shortcuts.map((s) => s.keys)).toEqual([
            [['Control/Meta', 'z']],
            [
                ['Control/Meta', 'y'],
                ['Control/Meta', 'Shift', 'z']
            ]
        ]);
        unregister();
        expect(context.removeShortcutsByGroup).toHaveBeenCalledWith(
            'mfeUndoRedo'
        );
        expect(shortcuts).toHaveLength(0);
    });
});
