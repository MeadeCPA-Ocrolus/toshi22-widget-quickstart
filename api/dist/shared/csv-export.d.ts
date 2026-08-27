/**
 * CSV Export Utility
 *
 * Converts arrays of row objects into CSV strings, with proper quoting/
 * escaping for values containing commas, quotes, or newlines (common in
 * transaction descriptions and merchant names).
 *
 * @module shared/csv-export
 */
export declare function toCsv<T extends object>(rows: T[], columns?: {
    key: keyof T;
    header: string;
}[]): string;
export declare function sanitizeFilename(name: string): string;
//# sourceMappingURL=csv-export.d.ts.map