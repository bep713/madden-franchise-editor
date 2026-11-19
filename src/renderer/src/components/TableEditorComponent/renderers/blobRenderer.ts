import type Handsontable from 'handsontable';
import { baseRenderer } from 'handsontable/renderers';
import { createEditButton } from './editButton';

const PREVIEW_LENGTH = 100;

// Port of v4's BinaryBlobRenderer: a preview of the JSON plus an edit button.
// The column has `editor: false`, so the blob is only edited in the modal.
export function blobRenderer(
    instance: Handsontable.Core,
    td: HTMLTableCellElement,
    row: number,
    col: number,
    prop: string | number,
    value: unknown,
    cellProperties: Handsontable.CellProperties
): void {
    baseRenderer(instance, td, row, col, prop, value, cellProperties);

    const text = value === null || value === undefined ? '' : String(value);
    const wrapper = document.createElement('div');
    wrapper.className = 'table-cell--with-button';

    const preview = document.createElement('span');
    preview.textContent =
        text.length > PREVIEW_LENGTH
            ? `${text.slice(0, PREVIEW_LENGTH)}...`
            : text;

    wrapper.append(preview, createEditButton('edit-blob', 'Edit blob'));
    td.replaceChildren(wrapper);
}
