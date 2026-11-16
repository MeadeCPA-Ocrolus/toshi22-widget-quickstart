/**
 * Safe logging helpers (factory items F-12, F-18, F-19)
 *
 * Rules these helpers enforce:
 *   1. Never log a raw Error/axios object. Plaid and mssql errors can carry the
 *      request config (including the PLAID-SECRET header), connection details,
 *      and SQL text with client data.
 *   2. Never log secrets (link tokens, public tokens, access tokens, keys,
 *      connection strings) or personal data (names, emails, phone numbers).
 *      Log opaque ids (client_id, item_id) instead.
 *   3. Anything that has to be logged as free text goes through redact() first.
 *
 * @module shared/safe-log
 */

import { Context } from '@azure/functions';
import { randomUUID } from 'crypto';

export interface SafeErrorInfo {
    name: string;
    message: string;
    code?: string | number;
    httpStatus?: number;
    plaidErrorType?: string;
    plaidErrorCode?: string;
    plaidRequestId?: string;
}

const REDACTIONS: Array<[RegExp, string]> = [
    // Plaid tokens: access-sandbox-xxxx, public-production-xxxx, link-sandbox-xxxx
    [/\b(access|public|link)-(sandbox|development|production)-[0-9A-Za-z-]{8,}/g, '[REDACTED_PLAID_TOKEN]'],
    // Azure storage / SQL connection string secrets
    [/(AccountKey|Password|Pwd|SharedAccessKey)\s*=\s*[^;\s'"]+/gi, '$1=[REDACTED]'],
    // SAS signatures and other signed query params
    [/([?&](sig|signature|token|secret|key)=)[^&\s'"]+/gi, '$1[REDACTED]'],
    // Authorization headers / bearer tokens
    [/\bBearer\s+[A-Za-z0-9._~+/=-]{10,}/gi, 'Bearer [REDACTED]'],
    // PLAID-SECRET style header or client_secret assignments
    [/((plaid[-_]?secret|client[-_]?secret|secret)["']?\s*[:=]\s*["']?)[A-Za-z0-9._~+/=-]{8,}/gi, '$1[REDACTED]'],
    // Email addresses
    [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]'],
];

/** Masks secrets and obvious personal data in free text before it is logged. */
export function redact(text: unknown): string {
    let out = typeof text === 'string' ? text : String(text);
    for (const [pattern, replacement] of REDACTIONS) {
        out = out.replace(pattern, replacement);
    }
    // Keep log lines bounded so a huge payload can't be dumped into the logs
    return out.length > 500 ? `${out.slice(0, 500)}...[truncated]` : out;
}

/**
 * Reduces any thrown value to a small, safe description. Deliberately ignores
 * err.config, err.request, err.response.headers and the response body except for
 * the documented Plaid error fields.
 */
export function describeError(err: unknown): SafeErrorInfo {
    if (!(err instanceof Error)) {
        return { name: 'NonError', message: redact(err) };
    }

    const anyErr = err as any;
    const info: SafeErrorInfo = {
        name: err.name,
        message: redact(err.message),
    };

    if (anyErr.code !== undefined && (typeof anyErr.code === 'string' || typeof anyErr.code === 'number')) {
        info.code = anyErr.code;
    }

    const status = anyErr.response?.status;
    if (typeof status === 'number') info.httpStatus = status;

    const plaidData = anyErr.response?.data;
    if (plaidData && typeof plaidData === 'object') {
        if (typeof plaidData.error_type === 'string') info.plaidErrorType = plaidData.error_type;
        if (typeof plaidData.error_code === 'string') info.plaidErrorCode = plaidData.error_code;
        if (typeof plaidData.request_id === 'string') info.plaidRequestId = plaidData.request_id;
    }

    return info;
}

/** Logs an error safely: label + sanitized description, never the raw object. */
export function logError(context: Context, label: string, err: unknown, correlationId?: string): void {
    const info = describeError(err);
    const prefix = correlationId ? `[${correlationId}] ` : '';
    context.log.error(`${prefix}${label}: ${JSON.stringify(info)}`);
}

export function newCorrelationId(): string {
    return randomUUID();
}
