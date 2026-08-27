/**
 * CSV Export Utility
 *
 * Converts arrays of row objects into CSV strings, with proper quoting/
 * escaping for values containing commas, quotes, or newlines (common in
 * transaction descriptions and merchant names).
 *
 * @module shared/csv-export
 */

function escapeCsvField(value: unknown): string {
    if (value === null || value === undefined) {
        return '';
    }

    const str = value instanceof Date ? value.toISOString() : String(value);

    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
}

export function toCsv<T extends object>(
    rows: T[],
    columns?: { key: keyof T; header: string }[]
): string {
    if (rows.length === 0 && !columns) {
        return '';
    }

    const cols = columns || (Object.keys(rows[0] || {}) as (keyof T)[]).map((key) => ({ key, header: String(key) }));

    const headerLine = cols.map((c) => escapeCsvField(c.header)).join(',');
    const dataLines = rows.map((row) => cols.map((c) => escapeCsvField(row[c.key])).join(','));

    return [headerLine, ...dataLines].join('\r\n');
}

export function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').trim() || 'unnamed';
}
