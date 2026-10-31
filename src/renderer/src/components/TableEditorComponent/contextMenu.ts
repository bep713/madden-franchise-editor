import type { DetailedSettings } from 'handsontable/plugins/contextMenu';
import type { TableData } from '@shared/types';
import type { GridOrientation } from './orientation';

// getSelectedLast(): [row1, col1, row2, col2], visual, unordered
export type SelectionRange = [
    row1: number,
    col1: number,
    row2: number,
    col2: number
];

// Records covered by the range: normal view rows, inverted view columns - 1.
// null when it touches a header or the inverted field-name column.
export function selectedRecordRange(
    range: SelectionRange | number[] | undefined,
    orientation: Pick<GridOrientation, 'toRecordIndex'>
): { start: number; end: number } | null {
    if (!range || range.length < 4) {
        return null;
    }
    const [row1, col1, row2, col2] = range;
    const first = orientation.toRecordIndex(row1, col1);
    const last = orientation.toRecordIndex(row2, col2);
    if (first === null || last === null) {
        return null;
    }
    return { start: Math.min(first, last), end: Math.max(first, last) };
}

// The one record the range covers, else null
export function singleSelectedRecord(
    range: SelectionRange | number[] | undefined,
    orientation: Pick<GridOrientation, 'toRecordIndex'>
): number | null {
    const records = selectedRecordRange(range, orientation);
    return records && records.start === records.end ? records.start : null;
}

// Indices in the range that aren't empty yet
export function recordsToEmpty(
    range: SelectionRange | number[] | undefined,
    orientation: Pick<GridOrientation, 'toRecordIndex'>,
    emptyRecordIndices: ReadonlySet<number>
): number[] {
    const records = selectedRecordRange(range, orientation);
    const indices: number[] = [];
    if (!records) {
        return indices;
    }
    for (let index = records.start; index <= records.end; index++) {
        if (!emptyRecordIndices.has(index)) {
            indices.push(index);
        }
    }
    return indices;
}

// A record smaller than 4 bytes can't hold the empty-record pointer
export function canEmptyRecords(table: Pick<TableData, 'header'>): boolean {
    return Number(table.header?.record1Size ?? 0) >= 4;
}

export interface ContextMenuAction {
    disabled(): boolean;
    run(): void;
}

export interface ContextMenuActions {
    findReferences: ContextMenuAction;
    openReferenceInNewTab: ContextMenuAction;
    setRecordsEmpty: ContextMenuAction;
    setNextRecordToUse: ContextMenuAction;
}

// Handsontable contextMenu settings with v4's keys, labels and order
// (contextMenuService.js)
export function buildContextMenu(
    actions: ContextMenuActions
): DetailedSettings {
    const item = (name: string, action: ContextMenuAction) => ({
        name,
        disabled: () => action.disabled(),
        callback: () => action.run()
    });
    return {
        items: {
            find_references: item(
                'Find references to this record...',
                actions.findReferences
            ),
            open_new_tab: item(
                'Open this reference in a new tab',
                actions.openReferenceInNewTab
            ),
            empty_row: item(
                'Set selected record(s) as empty',
                actions.setRecordsEmpty
            ),
            advanced: {
                name: 'Advanced...',
                submenu: {
                    items: [
                        {
                            key: 'advanced:setNextRecordToUse',
                            ...item(
                                'Set as next empty record to use',
                                actions.setNextRecordToUse
                            )
                        }
                    ]
                }
            }
        }
    };
}
