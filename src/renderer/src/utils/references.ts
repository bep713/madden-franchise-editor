export interface Reference {
    tableId: number;
    recordIndex: number;
}

export interface ResolvedReference extends Reference {
    tableName: string;
}

export function bin2dec(binary: string): number {
    return parseInt(binary, 2);
}

export function dec2bin(dec: number, len?: number): string {
    const binary = (dec >>> 0).toString(2);
    return len ? binary.padStart(len, '0') : binary;
}

export function calculateReferenceBinary(tableId: number, row: number): string {
    return dec2bin(tableId, 15) + dec2bin(row, 17);
}

// Same substrings as v4's ReferenceRenderer (the second character is skipped on purpose).
export function parseReference(value: unknown): Reference | null {
    if (typeof value !== 'string' || value.length !== 32 || value[0] !== '0') {
        return null;
    }
    return {
        tableId: bin2dec(value.substring(2, 15)),
        recordIndex: bin2dec(value.substring(16))
    };
}

export function resolveReference(
    value: unknown,
    tableNames: ReadonlyMap<number, string>
): ResolvedReference | null {
    const ref = parseReference(value);
    if (!ref || ref.tableId <= 0) return null;
    const tableName = tableNames.get(ref.tableId);
    return tableName === undefined ? null : { ...ref, tableName };
}

export function formatReference(ref: {
    tableName: string;
    recordIndex: number;
}): string {
    return `${ref.tableName} - ${ref.recordIndex}`;
}
