import Fuse from 'fuse.js';

// The tables shown for a search: all of them in index order when the search
// is empty, otherwise Fuse's matches on index, name and id, best first
export function filterTables<
    T extends { id: number; index: number; name: string }
>(tables: T[], filterText: string): T[] {
    if (filterText.length === 0) {
        return [...tables].sort((a, b) => a.index - b.index);
    }

    const fuse = new Fuse(tables, {
        keys: ['index', 'name', 'id'],
        includeScore: true
    });
    return fuse.search(filterText).map((result) => result.item);
}
