"use strict";
/**
 * CSV Export Utility
 *
 * Converts arrays of row objects into CSV strings, with proper quoting/
 * escaping for values containing commas, quotes, or newlines (common in
 * transaction descriptions and merchant names).
 *
 * @module shared/csv-export
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.toCsv = toCsv;
exports.sanitizeFilename = sanitizeFilename;
function escapeCsvField(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const str = value instanceof Date ? value.toISOString() : String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}
function toCsv(rows, columns) {
    if (rows.length === 0 && !columns) {
        return '';
    }
    const cols = columns || Object.keys(rows[0] || {}).map((key) => ({ key, header: String(key) }));
    const headerLine = cols.map((c) => escapeCsvField(c.header)).join(',');
    const dataLines = rows.map((row) => cols.map((c) => escapeCsvField(row[c.key])).join(','));
    return [headerLine, ...dataLines].join('\r\n');
}
function sanitizeFilename(name) {
    return name.replace(/[^a-zA-Z0-9 _-]/g, '').replace(/\s+/g, '_').trim() || 'unnamed';
}
//# sourceMappingURL=csv-export.js.map