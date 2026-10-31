import type { RecordCell } from '@renderer/utils/cellWrites';

export type { RecordCell };

// Maps between the grid's visual cells and (record, field). Normal: a row
// per record and a column per field. Inverted: a row per field, with the
// field name in column 0 and record r in column r + 1.
export interface GridOrientation {
    inverted: boolean;
    // A visual cell → its record cell. null for the inverted field-name column.
    toRecordCell(row: number, prop: string | number): RecordCell | null;
    // A record cell → the visual cell, for selectCell/setDataAtCell
    toVisualCell(cell: RecordCell): [row: number, col: number];
    // A record cell → the physical cell, for setSourceDataAtCell
    toSourceCell(cell: RecordCell): [row: number, prop: string | number];
    // A physical cell (cells()) → its record cell. null like toRecordCell.
    physicalToRecordCell(row: number, col: number): RecordCell | null;
    fieldIndexOf(fieldName: string): number | undefined;
}

export interface RowMapper {
    toPhysicalRow(row: number): number;
    toVisualRow(row: number): number;
}

export function createOrientation(
    inverted: boolean,
    headerNames: readonly string[],
    rows: RowMapper
): GridOrientation {
    // A paste is thousands of changes, so no indexOf per change
    const fieldIndices = new Map(
        headerNames.map((name, index) => [name, index])
    );
    const fieldIndexOf = (name: string) => fieldIndices.get(name);

    if (inverted) {
        // No sorting or moving in the inverted grid: visual = physical
        const toRecordCell = (row: number, prop: string | number) => {
            const col = Number(prop);
            return col >= 1 ? { recordIndex: col - 1, fieldIndex: row } : null;
        };
        const toCell = (cell: RecordCell): [number, number] => [
            cell.fieldIndex,
            cell.recordIndex + 1
        ];
        return {
            inverted,
            toRecordCell,
            toVisualCell: toCell,
            toSourceCell: toCell,
            physicalToRecordCell: toRecordCell,
            fieldIndexOf
        };
    }

    return {
        inverted,
        toRecordCell: (row, prop) => {
            const fieldIndex =
                typeof prop === 'number' ? prop : fieldIndices.get(prop);
            return fieldIndex === undefined
                ? null
                : { recordIndex: rows.toPhysicalRow(row), fieldIndex };
        },
        toVisualCell: (cell) => [
            rows.toVisualRow(cell.recordIndex),
            cell.fieldIndex
        ],
        toSourceCell: (cell) => [
            cell.recordIndex,
            headerNames[cell.fieldIndex]
        ],
        physicalToRecordCell: (row, col) =>
            col < headerNames.length
                ? { recordIndex: row, fieldIndex: col }
                : null,
        fieldIndexOf
    };
}

// The selection outside the grid: a field-name cell (inverted column 0)
// reports the field's first record
export function toSelectionCell(
    orientation: GridOrientation,
    row: number,
    col: number
): RecordCell {
    return (
        orientation.toRecordCell(row, col) ?? {
            recordIndex: 0,
            fieldIndex: row
        }
    );
}
