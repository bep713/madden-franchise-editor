// The renderer has no Node `path`; franchise file paths can use either separator.
export function basename(filePath: string): string {
    return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function dirname(filePath: string): string {
    const index = Math.max(
        filePath.lastIndexOf('/'),
        filePath.lastIndexOf('\\')
    );
    return index >= 0 ? filePath.slice(0, index) : '';
}
