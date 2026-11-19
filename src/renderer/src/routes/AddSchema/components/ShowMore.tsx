import { useState } from 'react';

import styles from './ShowMore.module.css';

interface ShowMore<T> {
    visible: T[];
    // The expand/collapse button, or null when every item fits
    toggle: React.ReactNode;
}

// Shows the first `limit` items, with a button for the rest. `what` names
// the list for the button's data-action, e.g. "files" → "show-more-files".
export function useShowMore<T>(
    items: T[],
    limit: number,
    what: string
): ShowMore<T> {
    const [expanded, setExpanded] = useState(false);
    const hidden = items.length - limit;
    if (hidden <= 0) return { visible: items, toggle: null };
    return {
        visible: expanded ? items : items.slice(0, limit),
        toggle: (
            <button
                aria-expanded={expanded}
                className={styles.toggle}
                data-action={`show-more-${what}`}
                onClick={() => setExpanded(!expanded)}
                type='button'
            >
                {expanded
                    ? 'Show fewer'
                    : `Show ${hidden.toLocaleString('en-US')} more`}
            </button>
        )
    };
}
