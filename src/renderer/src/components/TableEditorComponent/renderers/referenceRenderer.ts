import type Handsontable from 'handsontable';
import { baseRenderer, textRenderer } from 'handsontable/renderers';
import type { BaseRenderer } from 'handsontable/renderers';
import {
    formatReference,
    parseReference,
    resolveReference
} from '@renderer/utils/references';
import { createEditButton } from './editButton';

// Port of v4's ReferenceRenderer. Only 32-character references to another
// table (flag "0") get a link and the edit button; anything else is plain text.
// Clicks are handled by one delegated listener in TableEditorComponent.
// This is a plain function renderer, not a React component: the react-wrapper
// rebuilds a portal for every visible cell on each view render (scrolling
// included), and component renderers can't be swapped per cell from cells().
export function createReferenceRenderer(
    getTableNames: () => ReadonlyMap<number, string>
): BaseRenderer {
    return (
        instance: Handsontable.Core,
        td: HTMLTableCellElement,
        row: number,
        col: number,
        prop: string | number,
        value: unknown,
        cellProperties: Handsontable.CellProperties
    ) => {
        const reference = parseReference(value);
        if (!reference) {
            textRenderer(instance, td, row, col, prop, value, cellProperties);
            return;
        }

        baseRenderer(instance, td, row, col, prop, value, cellProperties);

        const wrapper = document.createElement('div');
        wrapper.className = 'table-cell--with-button';

        const resolved = resolveReference(value, getTableNames());
        if (resolved) {
            const link = document.createElement('a');
            link.dataset.action = 'follow-reference';
            link.dataset.tableId = String(resolved.tableId);
            link.dataset.recordIndex = String(resolved.recordIndex);
            link.textContent = formatReference(resolved);
            wrapper.appendChild(link);
        } else {
            const text = document.createElement('span');
            text.textContent = String(value);
            wrapper.appendChild(text);
        }

        wrapper.appendChild(
            createEditButton('edit-reference', 'Edit reference')
        );
        td.replaceChildren(wrapper);
    };
}
