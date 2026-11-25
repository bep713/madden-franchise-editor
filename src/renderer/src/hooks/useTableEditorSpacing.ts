import { useCallback } from 'react';
import usePreference from './usePreference';

export type TableEditorSpacing = 'default' | 'compact';

// The table editor's spacing preference. Compact has smaller cells and a
// table picker in the header in place of the sidebar. Any value other than
// 'compact' counts as default.
export default function useTableEditorSpacing(): {
    compact: boolean;
    toggleSpacing: () => void;
} {
    const [spacing, setSpacing] = usePreference<TableEditorSpacing>(
        'general.tableEditorSpacing',
        'default'
    );
    const compact = spacing === 'compact';
    const toggleSpacing = useCallback(
        () => setSpacing(compact ? 'default' : 'compact'),
        [compact, setSpacing]
    );
    return { compact, toggleSpacing };
}
