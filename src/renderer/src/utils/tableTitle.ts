// Some tables are unnamed: their name is empty or only NUL characters
// ("\u0000" for 4096 in M22). Those show just the id.
export const isUnnamed = (name: string): boolean =>
    name.replace(/\0/g, '').trim() === '';

// "<id> - <name>", as in v4's table header and tab names
export function tableTitle(tableId: number, name: string): string {
    return isUnnamed(name) ? String(tableId) : `${tableId} - ${name}`;
}
