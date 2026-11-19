import type Handsontable from 'handsontable';
import type { ColumnSettings } from 'handsontable/settings';
import type { TableData } from '@shared/types';
import { resolveReference } from '@renderer/utils/references';
import type { WriteState } from '@renderer/utils/cellWrites';
import type { GridOrientation } from './orientation';
import { errorRenderer } from './renderers/errorRenderer';

export interface CellMetaContext {
    table: TableData;
    orientation: GridOrientation;
    // buildColumns of the table's headers
    fieldColumns: readonly ColumnSettings[];
    writeState: WriteState;
    tableNames: ReadonlyMap<number, string>;
}

const FIELD_NAME_META: Handsontable.CellMeta = {
    readOnly: true,
    editor: false,
    renderer: 'text',
    className: 'table-cell--field-name',
    errorMessage: undefined
};

// v4's _getCellProperties. Every property is returned on every call,
// because Handsontable keeps what an earlier call set (for example the
// empty class after a row is un-emptied). Inverted, there are no column
// settings, so the field's editor, renderer and source come from here too.
export function getCellMeta(
    physicalRow: number,
    physicalCol: number,
    {
        table,
        orientation,
        fieldColumns,
        writeState,
        tableNames
    }: CellMetaContext
): Handsontable.CellMeta {
    const cell = orientation.physicalToRecordCell(physicalRow, physicalCol);
    if (!cell) {
        return orientation.inverted ? FIELD_NAME_META : {};
    }
    const { recordIndex, fieldIndex } = cell;
    const header = table.headers[fieldIndex];
    const column = fieldColumns[fieldIndex];
    if (!header || !column) {
        return {};
    }

    const fieldSettings: Handsontable.CellMeta = orientation.inverted
        ? { wordWrap: false, source: column.source }
        : {};

    const { cellErrors, emptyRecordIndices } = writeState;
    const errorMessage = cellErrors[recordIndex]?.[header.name];
    if (errorMessage) {
        return {
            ...fieldSettings,
            className: 'table-cell--error',
            readOnly: true,
            editor: false,
            renderer: errorRenderer,
            errorMessage
        };
    }

    let editor = column.editor;
    if (
        header.isReference &&
        resolveReference(table.records[recordIndex]?.[header.name], tableNames)
    ) {
        // A link to another table can't be typed into
        editor = false;
    }

    return {
        ...fieldSettings,
        className: emptyRecordIndices.has(recordIndex)
            ? 'table-cell--empty'
            : '',
        readOnly: false,
        editor,
        renderer: column.renderer,
        errorMessage: undefined
    };
}
