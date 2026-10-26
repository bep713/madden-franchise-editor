import type { ColumnSettings } from 'handsontable/settings';
import type { baseRenderer } from 'handsontable/renderers/baseRenderer';
import type { TableColumn } from '@shared/types/franchise';

type BaseRenderer = typeof baseRenderer;

export interface ColumnRenderers {
    reference: BaseRenderer;
    blob: BaseRenderer;
}

// Like v4's _formatColumns. The dropdown is an editor + renderer, not `type: 'dropdown'`,
// because that adds a validator v4 doesn't have (main rejects bad values instead).
export function buildColumns(
    headers: TableColumn[],
    renderers: ColumnRenderers
): ColumnSettings[] {
    return headers.map((header): ColumnSettings => {
        const isDropdown = !!header.enum || header.type === 'bool';
        const source = header.enum
            ? header.enum.members.map((member) => member.name)
            : ['true', 'false'];

        let renderer: ColumnSettings['renderer'];
        if (header.isReference) renderer = renderers.reference;
        else if (header.valueInThirdTable) renderer = renderers.blob;
        else renderer = isDropdown ? 'dropdown' : 'text';

        let editor: ColumnSettings['editor'];
        if (isDropdown) editor = 'dropdown';
        else
            editor =
                header.valueInThirdTable && !header.isReference
                    ? false
                    : 'text';

        return {
            data: header.name,
            wordWrap: false,
            renderer,
            editor,
            ...(isDropdown ? { source } : {})
        };
    });
}

// Port of v4's _calculateColumnWidths.
export function calculateColumnWidths(headers: TableColumn[]): number[] {
    return headers.map((header) => {
        const minWidth = header.name.length * 9 + 26;
        let width: number;

        if (header.isReference || header.enum) {
            width = Math.max((header.type.length + 6) * 9 + 35, 350);
        } else if (header.valueInThirdTable) {
            width = 700;
        } else if (header.maxLength) {
            width = header.maxLength * 9 + 26;
        } else if (header.type === 'bool') {
            width = 80;
        } else {
            width = header.length * 9 + 26;
        }

        return Math.max(minWidth, width);
    });
}
