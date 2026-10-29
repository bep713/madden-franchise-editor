// Selectr's search: a case-insensitive substring match, in header order
export function filterColumns(
    names: readonly string[],
    text: string
): { index: number; name: string }[] {
    const search = text.trim().toLowerCase();
    const columns = names.map((name, index) => ({ index, name }));
    return search
        ? columns.filter(({ name }) => name.toLowerCase().includes(search))
        : columns;
}

// parseInt like v4, so "12abc" is 12. NaN and negative numbers become 0, and a
// row past the last record is clamped to it.
export function parseRowIndex(text: string, rowCount: number): number {
    const row = parseInt(text, 10);
    if (Number.isNaN(row) || row < 0 || rowCount <= 0) {
        return 0;
    }
    return Math.min(row, rowCount - 1);
}
