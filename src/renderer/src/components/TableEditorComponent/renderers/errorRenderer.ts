import type Handsontable from 'handsontable';
import { baseRenderer } from 'handsontable/renderers';

// Port of v4's _renderErrorCell. `errorMessage` is set by the grid's cells().
export function errorRenderer(
    instance: Handsontable.Core,
    td: HTMLTableCellElement,
    row: number,
    col: number,
    prop: string | number,
    value: unknown,
    cellProperties: Handsontable.CellProperties
): void {
    baseRenderer(instance, td, row, col, prop, value, cellProperties);
    td.title = String(cellProperties.errorMessage ?? '');
    td.textContent = value ? String(value) : 'Error loading cell';
}
